const Application = require('../models/Application');
const Task = require('../models/Task');
const Volunteer = require('../models/Volunteer');
const { toPublicCertificate } = require('../views/certificateView');
const { streamCertificatePdf } = require('../utils/certificatePdf');
const { buildCertificateData } = require('../utils/certificateData');

/**
 * My Certificates (15-my-certificates.html) — converted the same way the
 * admin log was: there's no separate Certificate model, this reads
 * Application.certificateIssued straight off the volunteer's own records.
 *
 * "Pending" mirrors the mockup's dashed pending card exactly: a Track B
 * application only shows up there once its assigned Task has actually been
 * submitted (status 'submitted' or 'revision') — i.e. the volunteer has
 * handed in work and a certificate is realistically imminent, matching the
 * mockup's copy ("pending manager approval... once your submitted work is
 * approved"). A task that's merely 'assigned'/'inprogress' isn't shown here
 * at all; that's what My Tasks is for. Track A never has a pending state —
 * its submission and certificate issuance happen in the same instant (see
 * volunteerApplicationController.submitTrackA).
 */

// GET /api/volunteer/certificates
exports.listMyCertificates = async (req, res, next) => {
  try {
    const [volunteer, earnedApps, pendingTasks] = await Promise.all([
      Volunteer.findById(req.user.id).select('firstName lastName'),
      Application.find({ volunteer: req.user.id, certificateIssued: true })
        .populate('opportunity')
        .sort({ certificateIssuedAt: -1 }),
      Task.find({ volunteer: req.user.id, status: { $in: ['submitted', 'revision'] } }).populate('opportunity'),
    ]);

    const earned = earnedApps.filter((a) => a.opportunity).map((a) => toPublicCertificate(a, a.opportunity, volunteer));
    const pending = pendingTasks
      .filter((t) => t.opportunity)
      .map((t) => ({
        opportunityTitle: t.opportunity.title,
        department: (t.opportunity.depts || [])[0] || '—',
        track: 'b',
      }));

    res.json({
      earned,
      pending,
      summary: { earned: earned.length, pending: pending.length, downloadable: earned.length },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/volunteer/certificates/:id/pdf   — :id is the real Application
// _id (the friendly certificateId is display-only, see certificateView.js).
exports.downloadCertificatePdf = async (req, res, next) => {
  try {
    const application = await Application.findOne({ _id: req.params.id, volunteer: req.user.id }).populate(
      'opportunity'
    );
    if (!application || !application.opportunity || !application.certificateIssued) {
      return res.status(404).json({ message: 'Certificate not found.' });
    }

    const volunteer = await Volunteer.findById(req.user.id).select('firstName lastName');
    const cert = await buildCertificateData(application, application.opportunity, volunteer);
    streamCertificatePdf(res, cert);
  } catch (err) {
    next(err);
  }
};
