const Application = require('../models/Application');
const { toPublicOpportunity } = require('./opportunityView');

// The volunteer-facing status pipeline, in display order. "applied" isn't a
// real stored status (an application is created straight into 'under_review'
// or 'claimed') — it's a virtual first node, always shown as done, matching
// 11-my-applications.html's timeline which always starts on "Applied".
const TRACK_B_TIMELINE = ['applied', 'under_review', 'shortlisted', 'task_assigned', 'completed'];
const TRACK_A_TIMELINE = ['claimed', 'submitted', 'completed', 'certificate'];

const STEP_LABELS = {
  applied: 'Applied',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  task_assigned: 'Task Assigned',
  completed: 'Completed',
  claimed: 'Claimed',
  submitted: 'Submitted',
  certificate: 'Certificate',
};

const STATUS_CHIP = {
  under_review: { label: '⏳ Under Review', variant: 'review' },
  shortlisted: { label: '🔵 Shortlisted', variant: 'shortlist' },
  task_assigned: { label: '📌 Task Assigned', variant: 'assigned' },
  completed: { label: '✓ Completed', variant: 'complete' },
  not_selected: { label: 'Not Selected', variant: 'not-selected' },
  withdrawn: { label: 'Withdrawn', variant: 'withdrawn' },
  claimed: { label: '🌱 Claimed', variant: 'assigned' },
  submitted: { label: '📤 Submitted', variant: 'review' },
};

// Builds the done/current/future timeline the frontend renders as dots —
// same visual language as the mockup's .st-dot.done / .current / .future.
function buildTimeline(track, status, certificateIssued) {
  const sequence = track === 'a' ? TRACK_A_TIMELINE : TRACK_B_TIMELINE;

  // Off-path terminal outcomes (withdrawn / not_selected) don't have a
  // position on the forward-progress line — the chip alone communicates
  // them, and the timeline just freezes wherever it last was. We don't have
  // "wherever it last was" without statusHistory, so this view function
  // takes the resolved application doc (with statusHistory) rather than
  // just the bare status — see toPublicApplication below.
  let reachedIndex;
  if (status === 'withdrawn' || status === 'not_selected') {
    reachedIndex = -1; // caller overrides using statusHistory before this point — see toPublicApplication
  } else if (status === 'completed' && track === 'a') {
    reachedIndex = certificateIssued ? sequence.indexOf('certificate') : sequence.indexOf('completed');
  } else {
    reachedIndex = sequence.indexOf(status);
  }

  return sequence.map((step, i) => ({
    key: step,
    label: STEP_LABELS[step],
    state: i < reachedIndex ? 'done' : i === reachedIndex ? 'current' : i > reachedIndex ? 'future' : 'done',
  }));
}

// For a withdrawn/not_selected application, freeze the timeline at the last
// real (non-terminal) status it held before that outcome, so the dots still
// show real progress instead of resetting to nothing.
function lastNonTerminalStatus(track, statusHistory) {
  const sequence = track === 'a' ? TRACK_A_TIMELINE : TRACK_B_TIMELINE;
  for (let i = statusHistory.length - 1; i >= 0; i--) {
    if (sequence.includes(statusHistory[i].status)) return statusHistory[i].status;
  }
  return sequence[0];
}

function toPublicApplication(doc, opportunityDoc) {
  const track = doc.track;
  const status = doc.status;
  const isOffPath = status === 'withdrawn' || status === 'not_selected';

  const timeline = isOffPath
    ? buildTimeline(track, lastNonTerminalStatus(track, doc.statusHistory || []), doc.certificateIssued).map(
        (s) => (s.state === 'future' ? s : { ...s, state: 'done' })
      )
    : buildTimeline(track, status, doc.certificateIssued);

  // Cosmetic reference code shown on the Confirmation screen
  // (09-confirmation.html's "ST-2026-78421") — derived from the real _id and
  // creation year, not a separately stored field.
  const referenceId = `ST-${new Date(doc.createdAt).getFullYear()}-${String(doc._id).slice(-6).toUpperCase()}`;

  return {
    id: doc._id,
    referenceId,
    opportunity: opportunityDoc ? toPublicOpportunity(opportunityDoc) : null,
    track,
    status,
    chip: STATUS_CHIP[status] || { label: status, variant: 'default' },
    timeline,
    nextStep: doc.nextStep || '',
    claimDetails: track === 'a' ? doc.claimDetails || {} : undefined,
    interestDetails: track === 'b' ? doc.interestDetails || {} : undefined,
    submission: doc.submission && doc.submission.submittedAt ? doc.submission : null,
    certificateIssued: !!doc.certificateIssued,
    canWithdraw: !Application.TERMINAL_STATUSES.includes(status),
    canSubmit: track === 'a' && status === 'claimed',
    appliedAt: doc.createdAt,
    withdrawnAt: doc.withdrawnAt || null,
    statusHistory: (doc.statusHistory || []).map((h) => ({ status: h.status, at: h.at, note: h.note })),
    updatedAt: doc.updatedAt,
  };
}

module.exports = { toPublicApplication, defaultNextStepStatuses: STATUS_CHIP };
