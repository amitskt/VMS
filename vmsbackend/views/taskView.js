const { toPublicOpportunity } = require('./opportunityView');

const STATUS_LABELS = {
  assigned: 'Assigned',
  inprogress: 'In Progress',
  submitted: 'Submitted',
  revision: 'Revision Needed',
  completed: 'Completed',
};

// volunteer/opportunity may already be plain sub-objects (admin listing,
// which shapes its own volunteer summary) or populated Mongoose docs
// (volunteer-facing endpoints) — accept either rather than forcing every
// caller to pre-shape things the same way.
function toPublicTask(doc, opportunityDoc) {
  return {
    id: doc._id,
    application: doc.application,
    opportunity: opportunityDoc ? toPublicOpportunity(opportunityDoc) : null,
    title: doc.title,
    description: doc.description,
    dueDate: doc.dueDate,
    reportingPerson: doc.reportingPerson,
    submissionInstructions: doc.submissionInstructions || '',
    status: doc.status,
    statusLabel: STATUS_LABELS[doc.status] || doc.status,
    submission: doc.submission && doc.submission.submittedAt ? doc.submission : null,
    contributionHours: doc.contributionHours ?? null,
    comments: (doc.comments || []).map((c) => ({
      authorRole: c.authorRole,
      authorName: c.authorName,
      text: c.text,
      at: c.at,
    })),
    canSubmit: doc.status === 'assigned' || doc.status === 'inprogress' || doc.status === 'revision',
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

module.exports = { toPublicTask, TASK_STATUS_LABELS: STATUS_LABELS };
