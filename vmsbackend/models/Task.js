const mongoose = require('mongoose');

// Converted from admin-09-task-board.html's kanban + 12-my-tasks.html's
// Track B section. A Task only ever exists for a Track B application, and
// only once that application has reached 'shortlisted' (the old separate
// 'selected' step was removed — "Tasks are created here only after an
// application has been moved to Shortlisted on the Applications screen") —
// enforced in adminTaskController.createTask, not here.
//
// Track A has no Task document at all: its "claim -> submit -> certificate"
// lifecycle already lives entirely on the Application itself (see
// Application.submission / volunteerApplicationController.submitTrackA),
// and 12-my-tasks.html's Track A section is really just that same claimed
// application rendered as a task card — MyTasks.jsx reads Applications
// directly for that half of the page, not this model.
const TASK_STATUSES = ['assigned', 'inprogress', 'submitted', 'revision', 'completed'];

const taskSchema = new mongoose.Schema(
  {
    // One task per application — re-assigning would mean editing this one,
    // not creating a second (the unique index below is the real guard;
    // createTask's own pre-check just gives a friendlier error message).
    application: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true, unique: true, index: true },
    opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity', required: true, index: true },
    volunteer: { type: mongoose.Schema.Types.ObjectId, ref: 'Volunteer', required: true, index: true },

    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    dueDate: { type: Date, required: true },
    reportingPerson: { type: String, required: true, trim: true },
    // Free-text instructions from the Assign Task form (e.g. "share as a
    // Drive folder link") — separate from `submission` below, which is the
    // volunteer's actual handed-in work.
    submissionInstructions: { type: String, trim: true, default: '' },

    status: { type: String, enum: TASK_STATUSES, default: 'assigned' },

    // The volunteer's actual handed-in work — either an uploaded file
    // (stored in amit@sankalptaru.org's Google Drive, see
    // utils/driveUpload.js; only the resulting URL lands in Mongo) or a
    // pasted link (Google Drive/Docs, stored as plain text, never
    // fetched/validated server-side).
    submission: {
      fileUrl: { type: String, trim: true, default: '' },
      fileName: { type: String, trim: true, default: '' },
      link: { type: String, trim: true, default: '' },
      note: { type: String, trim: true, default: '' },
      submittedAt: { type: Date },
    },

    // Set only when a submission is approved (status -> completed) — same
    // moment Application.certificateIssued flips true (see
    // adminTaskController.updateTaskStatus).
    contributionHours: { type: Number, min: 0 },

    // Coordinator <-> volunteer thread on this task — the mockup's comment
    // list plus revision feedback both land here rather than as a separate
    // structure, so "why was this sent back?" and "any updates?" show up in
    // one place for both sides.
    comments: [
      {
        _id: false,
        authorRole: { type: String, enum: ['admin', 'manager', 'volunteer'], required: true },
        authorName: { type: String, trim: true, default: '' },
        text: { type: String, required: true, trim: true },
        at: { type: Date, default: Date.now },
      },
    ],

    assignedByRole: { type: String, enum: ['admin', 'manager'] },
    assignedById: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

taskSchema.statics.TASK_STATUSES = TASK_STATUSES;

module.exports = mongoose.model('Task', taskSchema);
