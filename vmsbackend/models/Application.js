const mongoose = require('mongoose');

// Track B (skilled, manager-reviewed) goes through a real review pipeline.
// Track A (evergreen, auto-approved) has no review step — claiming it starts
// a much shorter lifecycle that ends the moment the volunteer submits proof
// of work (see controllers/volunteerApplicationController.js's submitTrackA,
// which moves 'claimed' -> 'submitted' -> 'completed' in the same request,
// matching the "no review barrier, certificate generated automatically on
// submission" rule already established on OpportunityDetail.jsx).
const TRACK_A_STATUSES = ['claimed', 'submitted', 'completed', 'withdrawn'];
const TRACK_B_STATUSES = [
  'under_review',
  'shortlisted',
  'task_assigned',
  'completed',
  'not_selected',
  'withdrawn',
];

// A status an application can never leave once reached. Used to keep
// Opportunity.apps counting only currently-open applications (see
// utils/applicationLifecycle.js) — matches archiveOpportunity's "Resolve
// open applications before archiving" language in opportunityController.js.
const TERMINAL_STATUSES = ['completed', 'withdrawn', 'not_selected'];

// Which Track B statuses count as "actually holding a capacity slot" on an
// opportunity — distinct from TERMINAL_STATUSES/apps above. A volunteer
// still 'under_review' hasn't been accepted onto the project yet, so they
// don't block anyone else from applying; but once a manager shortlists them
// (or moves them further), that's a real slot used, and it stays used even
// after they finish ('completed') since the project doesn't free up a
// replacement slot for work that's already done. See
// utils/opportunityCapacity.js, which is what actually compares this against
// Opportunity.capacity.
const CAPACITY_HOLDING_STATUSES = ['shortlisted', 'task_assigned', 'completed'];

const applicationSchema = new mongoose.Schema(
  {
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true, index: true },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },

    // Copied from the opportunity at creation time rather than always
    // dereferenced live — an opportunity's track is locked once applications
    // exist (see opportunityController.js's updateOpportunity), so this can
    // never drift, and it lets status validation happen without a populate.
    track: { type: String, enum: ['a', 'b'], required: true },

    status: {
      type: String,
      required: true,
      enum: [...new Set([...TRACK_A_STATUSES, ...TRACK_B_STATUSES])],
    },

    // Audit trail + what the volunteer's status-timeline UI renders from.
    statusHistory: [
      {
        _id: false,
        status: { type: String, required: true },
        at: { type: Date, default: Date.now },
        note: { type: String, default: '' },
      },
    ],

    // Free text shown on the volunteer's application card under "Next Step".
    // Defaults come from utils/applicationLifecycle.js's DEFAULT_NEXT_STEP
    // map; an admin/manager can override it with a custom note when they
    // update status.
    nextStep: { type: String, default: '' },

    // Track A only — collected on 07-track-a-claim.html's claim form. All
    // optional (the mockup lets you claim before deciding on species/date).
    claimDetails: {
      city: { type: String, trim: true, default: '' },
      plannedDate: { type: Date },
      species: { type: String, trim: true, default: '' },
    },

    // Track B only — collected on 08-track-b-express-interest.html's
    // "Express Interest" form. Motivation is the one required field there
    // (min 80 chars, enforced in the controller so the rule lives in one
    // place rather than trusting the frontend's own check).
    interestDetails: {
      motivation: { type: String, trim: true, default: '' },
      portfolioUrl: { type: String, trim: true, default: '' },
      startAvailability: {
        type: String,
        enum: ['immediate', '2weeks', '1month', 'flexible', ''],
        default: '',
      },
    },

    // Track A only — the volunteer's proof-of-work, submitted once and
    // immediately finalized (see submitTrackA). `photoUrl` is a real Google
    // Drive URL (utils/driveUpload.js) rather than a base64 data URL —
    // either that or `driveLink` is required, never both/neither (enforced
    // in the controller). (`driveLink` remains the field name for a
    // volunteer-pasted link, kept as-is even though uploaded photos now
    // also land in Drive.)
    submission: {
      text: { type: String, default: '' },
      photoUrl: { type: String, default: '' },
      driveLink: { type: String, trim: true, default: '' },
      submittedAt: { type: Date },
    },

    certificateIssued: { type: Boolean, default: false },
    certificateIssuedAt: { type: Date },
    // Which CertificateTemplate this SPECIFIC certificate was rendered
    // with, set once at issuance time (see controllers/adminTaskController.js,
    // adminApplicationController.js, volunteerApplicationController.js) and
    // never changed afterward. Frozen so a later admin switching
    // CertificateSettings.activeTemplateId never changes how an already
    // -issued certificate re-downloads or looks on a re-sent email. null
    // for certificates issued before this field existed (see
    // scripts/migratePinCertificateTemplates.js) and for legacy
    // installs that never had a CertificateTemplate gallery at all —
    // utils/certificatePdf.js falls back to CertificateSettings' legacy
    // certificateTemplate field in that case.
    certificateTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },
    // Drive link for the actual generated certificate PDF, uploaded once
    // into the volunteer's own Drive subfolder at issuance time (see
    // utils/certificateData.js's uploadCertificateToDrive, called
    // fire-and-forget right after certificateTemplateId is pinned above).
    // Best-effort — stays null if the Drive upload failed or hasn't run
    // yet (e.g. a certificate issued before this existed); the 'Download
    // PDF' button never depends on this and keeps working by generating
    // the PDF fresh either way (utils/certificatePdf.js).
    certificateDriveUrl: { type: String, default: null },
    certificateDriveKey: { type: String, default: null },

    withdrawnAt: { type: Date },

    // Which staff account last changed the status (Track B review), if any.
    reviewedByRole: { type: String, enum: ['admin', 'manager'] },
    reviewedById: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

// Not a uniqueness constraint at the DB level — a volunteer CAN apply again
// after a withdrawal or a not_selected outcome. "No duplicate ACTIVE
// application for the same opportunity" is enforced in the controller
// (createApplication), where "active" actually means something (checking
// TERMINAL_STATUSES), not just "one row ever". This index just makes the
// controller's own lookup fast.
applicationSchema.index({ volunteer: 1, opportunity: 1 });

applicationSchema.statics.TRACK_A_STATUSES = TRACK_A_STATUSES;
applicationSchema.statics.TRACK_B_STATUSES = TRACK_B_STATUSES;
applicationSchema.statics.TERMINAL_STATUSES = TERMINAL_STATUSES;
applicationSchema.statics.CAPACITY_HOLDING_STATUSES = CAPACITY_HOLDING_STATUSES;

module.exports = mongoose.model('Application', applicationSchema);
