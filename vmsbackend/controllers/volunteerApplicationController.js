const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Volunteer = require('../models/Volunteer');
const { toPublicApplication } = require('../views/applicationView');
const { defaultNextStep, adjustAppsCountOnTransition } = require('../utils/applicationLifecycle');
const { isOpportunityFullById } = require('../utils/opportunityCapacity');
const { uploadBuffer, uploadBufferForVolunteer } = require('../utils/driveUpload');
const { notifyTrackACompleted, notifyApplicationReceived, notifyApplicationWithdrawn } = require('../utils/notifyVolunteer');
const { pinActiveCertificateTemplate, uploadCertificateToDrive } = require('../utils/certificateData');

/**
 * Volunteer-facing application lifecycle: claiming a Track A opportunity
 * (07-track-a-claim.html), expressing interest in a Track B one
 * (08-track-b-express-interest.html), the Confirmation screen right after
 * (09-confirmation.html), and My Applications (11-my-applications.html) for
 * tracking/withdrawing afterwards.
 *
 * Track A's "claim" is genuinely instant (no review barrier — an
 * already-established rule elsewhere in this app), but completion isn't:
 * the mockup's claim form collects optional details (city/date/species) and
 * explicitly defers the photo+story to later ("upload anytime from My
 * Tasks"). Since there's no My Tasks backend yet, that submission step
 * lives on My Applications instead — see submitTrackA below, which moves
 * claimed -> submitted -> completed in one request once the volunteer
 * actually has their proof ready, auto-issuing the certificate immediately
 * (matching "Certificate generated automatically on submission").
 *
 * Track B's "express interest" is a real reviewed application — motivation
 * is required (>= 80 chars, same floor as the mockup's own validation, but
 * enforced here so the rule can't be bypassed by calling the API directly).
 */

const MIN_MOTIVATION_LENGTH = 80;

// POST /api/volunteer/applications
exports.createApplication = async (req, res, next) => {
  try {
    const { opportunityId, claimDetails, interestDetails } = req.body;

    const opportunity = await Opportunity.findById(opportunityId);
    if (!opportunity || opportunity.status !== 'active') {
      return res.status(404).json({ message: 'This opportunity is no longer available.' });
    }

    // A volunteer can re-apply after a withdrawal or a not-selected outcome,
    // but never hold two applications in flight (or two completions) for
    // the same opportunity at once.
    const existing = await Application.findOne({
      volunteer: req.user.id,
      opportunity: opportunity._id,
      status: { $nin: ['withdrawn', 'not_selected'] },
    });
    if (existing) {
      return res.status(400).json({ message: 'You already have an application for this opportunity.' });
    }

    // Re-checked server-side even though the frontend already disables Apply
    // once opportunity.isFull comes back true — never trust that alone, a
    // volunteer could still hit this endpoint directly. Always false for
    // Track A (capacity is schema-enforced null there).
    if (await isOpportunityFullById(opportunity._id, opportunity.capacity)) {
      return res.status(400).json({ message: 'This opportunity has reached capacity and is no longer accepting new applications.' });
    }

    let status;
    const payload = {
      volunteer: req.user.id,
      opportunity: opportunity._id,
      track: opportunity.track,
    };

    if (opportunity.track === 'a') {
      status = 'claimed';
      payload.claimDetails = {
        city: claimDetails?.city || '',
        plannedDate: claimDetails?.plannedDate || undefined,
        species: claimDetails?.species || '',
      };
    } else {
      const motivation = (interestDetails?.motivation || '').trim();
      if (motivation.length < MIN_MOTIVATION_LENGTH) {
        return res.status(400).json({
          message: `Please write at least ${MIN_MOTIVATION_LENGTH} characters explaining your motivation.`,
        });
      }
      status = 'under_review';
      payload.interestDetails = {
        motivation,
        portfolioUrl: interestDetails?.portfolioUrl || '',
        startAvailability: interestDetails?.startAvailability || '',
      };
    }

    payload.status = status;
    payload.nextStep = defaultNextStep(status);
    payload.statusHistory = [{ status, at: new Date() }];

    const application = await Application.create(payload);

    // A brand-new application is always non-terminal — always a straight
    // +1, unlike adjustAppsCountOnTransition (which only fires on a
    // terminal <-> non-terminal edge between two existing statuses).
    await Opportunity.updateOne({ _id: opportunity._id }, { $inc: { apps: 1 } });

    // Fire-and-forget — see notifyVolunteer.js's header comment. Track B
    // only: 'under_review' is this application's very first status, so this
    // single email covers both "received" and "under review" — there's no
    // separate event for the two.
    if (opportunity.track === 'b') {
      const volunteer = await Volunteer.findById(req.user.id).select('firstName lastName email');
      if (volunteer) notifyApplicationReceived(volunteer, opportunity);
    }

    res.status(201).json({
      message: opportunity.track === 'a' ? 'Opportunity claimed!' : 'Application submitted!',
      application: toPublicApplication(application, opportunity),
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

// GET /api/volunteer/applications?status=&track=
exports.listMyApplications = async (req, res, next) => {
  try {
    const applications = await Application.find({ volunteer: req.user.id })
      .populate('opportunity')
      .sort({ createdAt: -1 });

    const counts = {
      all: applications.length,
      active: applications.filter((a) => !Application.TERMINAL_STATUSES.includes(a.status)).length,
      completed: applications.filter((a) => a.status === 'completed').length,
      trackA: applications.filter((a) => a.track === 'a').length,
      trackB: applications.filter((a) => a.track === 'b').length,
    };

    let filtered = applications;
    const { status, track } = req.query;
    if (status === 'active') filtered = filtered.filter((a) => !Application.TERMINAL_STATUSES.includes(a.status));
    else if (status === 'completed') filtered = filtered.filter((a) => a.status === 'completed');
    if (track === 'a' || track === 'b') filtered = filtered.filter((a) => a.track === track);

    res.json({
      applications: filtered
        .filter((a) => a.opportunity) // opportunity could theoretically be deleted; never crash on a dangling ref
        .map((a) => toPublicApplication(a, a.opportunity)),
      counts,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/volunteer/applications/:id
exports.getMyApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, volunteer: req.user.id }).populate(
      'opportunity'
    );
    if (!application) return res.status(404).json({ message: 'Application not found.' });
    res.json({ application: toPublicApplication(application, application.opportunity) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/volunteer/applications/:id/withdraw
exports.withdrawApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, volunteer: req.user.id });
    if (!application) return res.status(404).json({ message: 'Application not found.' });
    if (Application.TERMINAL_STATUSES.includes(application.status)) {
      return res.status(400).json({ message: 'This application can no longer be withdrawn.' });
    }

    const fromStatus = application.status;
    application.status = 'withdrawn';
    application.withdrawnAt = new Date();
    application.nextStep = defaultNextStep('withdrawn');
    application.statusHistory.push({ status: 'withdrawn', at: new Date() });
    await application.save();

    await adjustAppsCountOnTransition(application.opportunity, fromStatus, 'withdrawn');

    const opportunity = await Opportunity.findById(application.opportunity);

    // Fire-and-forget — see notifyVolunteer.js's header comment. Track B
    // only, matching this notification's scope.
    if (application.track === 'b' && opportunity) {
      const volunteer = await Volunteer.findById(req.user.id).select('firstName lastName email');
      if (volunteer) notifyApplicationWithdrawn(volunteer, opportunity);
    }

    res.json({ message: 'Application withdrawn.', application: toPublicApplication(application, opportunity) });
  } catch (err) {
    next(err);
  }
};

// POST /api/volunteer/applications/:id/submit  (Track A only)
// multipart/form-data: photo? (file), driveLink?, text?
// Moves claimed -> submitted -> completed in one step and issues the
// certificate immediately — see file header comment for why this doesn't
// wait on any review. Either an uploaded photo (stored in
// amit@sankalptaru.org's Google Drive, see utils/driveUpload.js) or a
// pasted Drive link is required as proof of work, never neither.
exports.submitTrackA = async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, volunteer: req.user.id });
    if (!application) return res.status(404).json({ message: 'Application not found.' });
    if (application.track !== 'a') {
      return res.status(400).json({ message: 'Only Track A opportunities are submitted this way.' });
    }
    if (application.status !== 'claimed') {
      return res.status(400).json({ message: 'This claim has already been submitted.' });
    }

    const text = req.body.text || '';
    const driveLink = (req.body.driveLink || '').trim();

    if (!req.file && !driveLink) {
      return res.status(400).json({ message: 'Attach a photo or paste a Google Drive link to complete this submission.' });
    }

    // Looked up here (not just later, alongside notify/certificate) so the
    // proof-of-work photo can be uploaded straight into this volunteer's
    // own Drive folder — see utils/driveUpload.js's uploadBufferForVolunteer.
    // Falls back to the flat root folder only in the unlikely case the
    // volunteer record itself can't be found.
    const volunteer = await Volunteer.findById(req.user.id).select('firstName lastName email');

    let photoUrl = '';
    if (req.file) {
      const uploaded = volunteer?.email
        ? await uploadBufferForVolunteer(req.file.buffer, req.file.originalname, req.file.mimetype, 'track-a', volunteer.email)
        : await uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, 'track-a');
      photoUrl = uploaded.url;
    }

    const now = new Date();
    application.submission = { text, photoUrl, driveLink, submittedAt: now };
    application.statusHistory.push({ status: 'submitted', at: now });
    application.statusHistory.push({ status: 'completed', at: now });
    application.status = 'completed';
    application.certificateIssued = true;
    application.certificateIssuedAt = now;
    application.nextStep = defaultNextStep('completed');
    await pinActiveCertificateTemplate(application);
    await application.save();

    await adjustAppsCountOnTransition(application.opportunity, 'claimed', 'completed');

    const opportunity = await Opportunity.findById(application.opportunity);

    // Fire-and-forget, includes the certificate PDF as an attachment — see
    // notifyVolunteer.js's header comment for why a mail failure here never
    // blocks this response (the submission + certificate are already saved
    // by this point). Reuses the `volunteer` looked up above.
    if (volunteer) {
      notifyTrackACompleted(volunteer, opportunity, application);
      uploadCertificateToDrive(application, opportunity, volunteer);
    }

    res.json({
      message: 'Submitted! Your certificate has been issued.',
      application: toPublicApplication(application, opportunity),
    });
  } catch (err) {
    next(err);
  }
};
