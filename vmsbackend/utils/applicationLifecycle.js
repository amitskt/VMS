const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');

// Shown on the volunteer's application card ("Next Step") whenever an
// admin/manager updates status without supplying a custom note, and also
// used as the initial nextStep when an application is first created.
const DEFAULT_NEXT_STEP = {
  claimed: "Submit your work below to complete this opportunity.",
  submitted: 'Finalizing your submission…',
  under_review: 'The team will review your application (usually 3–5 days).',
  shortlisted: 'You may receive a call or message from the coordinator — a task will be assigned soon.',
  task_assigned: 'Complete your assigned task and submit it for review.',
  completed: '🎉 Certificate available in My Certificates.',
  not_selected: "This application wasn't selected this time — check other opportunities.",
  withdrawn: 'You withdrew this application.',
};

function defaultNextStep(status) {
  return DEFAULT_NEXT_STEP[status] || '';
}

// Opportunity.apps is meant to reflect currently-OPEN applications (see its
// comment in models/Opportunity.js and archiveOpportunity's "Resolve open
// applications before archiving" check) — not a lifetime total. So it goes
// up once, on creation, and back down exactly once, the moment an
// application first reaches a terminal status (completed / withdrawn /
// not_selected). A status update that moves between two non-terminal
// statuses (e.g. shortlisted -> selected) never touches this counter.
async function adjustAppsCountOnTransition(opportunityId, fromStatus, toStatus) {
  const wasTerminal = Application.TERMINAL_STATUSES.includes(fromStatus);
  const isTerminal = Application.TERMINAL_STATUSES.includes(toStatus);
  if (wasTerminal === isTerminal) return; // no edge crossed either way

  const delta = isTerminal ? -1 : 1;
  await Opportunity.updateOne(
    { _id: opportunityId },
    { $inc: { apps: delta } }
  );
  // Never let this drift negative from a double-decrement race — cheap
  // insurance, since this project has no transaction support configured.
  await Opportunity.updateOne(
    { _id: opportunityId, apps: { $lt: 0 } },
    { $set: { apps: 0 } }
  );
}

module.exports = { defaultNextStep, adjustAppsCountOnTransition, DEFAULT_NEXT_STEP };
