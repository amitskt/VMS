const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Manager = require('../models/Manager');
const { toPublicApplication } = require('../views/applicationView');
const { defaultNextStep, adjustAppsCountOnTransition } = require('../utils/applicationLifecycle');
const { notifyShortlisted } = require('../utils/notifyVolunteer');
const { pinActiveCertificateTemplate, uploadCertificateToDrive } = require('../utils/certificateData');

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;

/**
 * Application review (Super Admin + Department Heads) — makes the Track B
 * pipeline (Applied -> Under Review -> Shortlisted -> Task Assigned ->
 * Completed) actually usable end-to-end, not just visible on the volunteer
 * side. The old separate 'selected' step was removed — a task can now be
 * assigned directly to any Shortlisted application from the Task Board.
 * Same department-scoping convention as
 * opportunityController.js: a manager only ever sees/manages applications
 * against opportunities owned by their own department, resolved server-side
 * from the Manager collection, never trusted from the client — an admin
 * (resolveScope returns null) sees every department's applications, while a
 * manager (e.g. the IT department head) only ever sees applications against
 * opportunities their own department owns, no matter which volunteer applied.
 */

async function resolveScope(req) {
  if (req.user.role !== 'manager') return null;
  const manager = await Manager.findById(req.user.id).select('department');
  return manager ? manager.department : undefined;
}

// Looks up the volunteer's cached Gemini score/reasons for one opportunity —
// same matchCache.matches array Saved.jsx's listSaved reads, reused here
// rather than recomputed (an admin listing screen should never trigger a
// Gemini call). Track A has no matching concept, so this is Track B only.
function matchFor(volunteer, opportunityId) {
  const entry = (volunteer.matchCache?.matches || []).find(
    (m) => String(m.opportunity) === String(opportunityId)
  );
  return { score: entry?.score ?? null, reasons: entry?.reasons || [] };
}

// GET /api/admin/applications/meta
exports.getMeta = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }
    res.json({
      trackAStatuses: Application.TRACK_A_STATUSES,
      trackBStatuses: Application.TRACK_B_STATUSES,
      departments: Opportunity.DEPARTMENTS,
      myDepartment,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/applications?search=&status=&track=&department=&page=&limit=
exports.listApplications = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const oppFilter = {};
    if (myDepartment) oppFilter.depts = myDepartment;
    else if (req.query.department && req.query.department !== 'all') oppFilter.depts = req.query.department;
    const scopedOpportunityIds = await Opportunity.find(oppFilter).distinct('_id');

    const appFilter = { opportunity: { $in: scopedOpportunityIds } };
    const { status, track } = req.query;
    if (track === 'a' || track === 'b') appFilter.track = track;
    if (status && [...Application.TRACK_A_STATUSES, ...Application.TRACK_B_STATUSES].includes(status)) {
      appFilter.status = status;
    }

    // Search spans volunteer name and opportunity title — neither is
    // denormalized onto Application, so (as with the volunteer-facing
    // opportunity list's own search) this filters in-memory after a single
    // scoped fetch rather than needing a cross-collection query.
    let applications = await Application.find(appFilter)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email photoUrl matchCache')
      .sort({ createdAt: -1 });

    applications = applications.filter((a) => a.opportunity && a.volunteer);

    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
      applications = applications.filter((a) => {
        const volunteerName = `${a.volunteer.firstName} ${a.volunteer.lastName}`.toLowerCase();
        return volunteerName.includes(search) || a.opportunity.title.toLowerCase().includes(search);
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));
    const total = applications.length;
    const pageItems = applications.slice((page - 1) * limit, page * limit);

    res.json({
      applications: pageItems.map((a) => {
        const match = a.track === 'b' ? matchFor(a.volunteer, a.opportunity._id) : { score: null, reasons: [] };
        return {
          ...toPublicApplication(a, a.opportunity),
          volunteer: {
            id: a.volunteer._id,
            name: `${a.volunteer.firstName} ${a.volunteer.lastName}`.trim() || '(no name on file)',
            email: a.volunteer.email,
            photoUrl: a.volunteer.photoUrl || '',
          },
          // depts is a list (an opportunity can be co-owned by more than one
          // department) — shown as the first/primary department in the table,
          // same simplification the admin Opportunities list already makes.
          department: (a.opportunity.depts || [])[0] || '—',
          matchScore: match.score,
          matchReasons: match.reasons,
        };
      }),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      myDepartment,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/applications/:id
exports.getApplication = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const application = await Application.findById(req.params.id)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email photoUrl matchCache');
    if (!application || !application.opportunity) {
      return res.status(404).json({ message: 'Application not found.' });
    }
    if (myDepartment && !application.opportunity.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This application isn't owned by ${myDepartment}.` });
    }

    const match = application.track === 'b' ? matchFor(application.volunteer, application.opportunity._id) : { score: null, reasons: [] };

    res.json({
      application: {
        ...toPublicApplication(application, application.opportunity),
        volunteer: {
          id: application.volunteer._id,
          name: `${application.volunteer.firstName} ${application.volunteer.lastName}`.trim() || '(no name on file)',
          email: application.volunteer.email,
          photoUrl: application.volunteer.photoUrl || '',
        },
        department: (application.opportunity.depts || [])[0] || '—',
        matchScore: match.score,
        matchReasons: match.reasons,
      },
    });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/applications/:id/status   body: { status, note? }
exports.updateStatus = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const application = await Application.findById(req.params.id)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email');
    if (!application || !application.opportunity) {
      return res.status(404).json({ message: 'Application not found.' });
    }
    if (myDepartment && !application.opportunity.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This application isn't owned by ${myDepartment}.` });
    }
    if (Application.TERMINAL_STATUSES.includes(application.status)) {
      return res.status(400).json({ message: 'This application has already reached a final status.' });
    }

    const { status, note } = req.body;
    const validStatuses = application.track === 'a' ? Application.TRACK_A_STATUSES : Application.TRACK_B_STATUSES;
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${validStatuses.join(', ')}.` });
    }
    // Track B's 'task_assigned' and 'completed' are no longer settable
    // through this generic status endpoint — they now only ever happen as a
    // side effect of a real Task record (adminTaskController.createTask sets
    // task_assigned; updateTaskStatus's completed branch, which requires
    // contribution hours, sets completed). Without this guard, this endpoint
    // could silently flip an application to "Task Assigned" with no task
    // ever created (nothing to show on My Tasks or the Task Board), or to
    // "Completed" — issuing a certificate — with no submission ever
    // reviewed. Track A is unaffected: its own 'completed' only ever comes
    // from submitTrackA, which this endpoint's TRACK_A_STATUSES branch was
    // never used to bypass in practice, so no extra guard is added there.
    if (application.track === 'b' && (status === 'task_assigned' || status === 'completed')) {
      return res.status(400).json({
        message:
          status === 'task_assigned'
            ? 'Assign a task on the Task Board to move this application to Task Assigned — status can\'t be set directly.'
            : 'Approve the volunteer\'s submitted task on the Task Board to complete this application — status can\'t be set directly.',
      });
    }

    const fromStatus = application.status;
    const now = new Date();
    application.status = status;
    application.statusHistory.push({ status, at: now, note: note || '' });
    application.nextStep = (note && note.trim()) || defaultNextStep(status);
    application.reviewedByRole = req.user.role;
    application.reviewedById = req.user.id;
    if (status === 'completed') {
      application.certificateIssued = true;
      application.certificateIssuedAt = now;
      await pinActiveCertificateTemplate(application);
    }
    await application.save();

    await adjustAppsCountOnTransition(application.opportunity._id, fromStatus, status);

    // Fire-and-forget: never blocks/fails this response — see
    // notifyVolunteer.js's header comment on why email delivery can't roll
    // back a status change that already succeeded.
    if (application.track === 'b' && status === 'shortlisted' && application.volunteer) {
      notifyShortlisted(application.volunteer, application.opportunity);
    }
    if (status === 'completed' && application.volunteer) {
      uploadCertificateToDrive(application, application.opportunity, application.volunteer);
    }

    res.json({ message: 'Application updated.', application: toPublicApplication(application, application.opportunity) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};
