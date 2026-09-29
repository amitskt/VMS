/**
 * One-time data migration for the "remove the separate 'selected' status"
 * change (models/Application.js's TRACK_B_STATUSES no longer includes
 * 'selected' — 'shortlisted' is now the only gate before a Task can be
 * assigned). This script exists because the enum change alone does nothing
 * to any Application document that was already sitting at status:
 * 'selected' before this change shipped — Mongoose doesn't validate
 * already-stored values against the enum on read, so those documents would
 * silently keep an invalid status forever (never showing correctly on
 * either the volunteer or admin side, and never re-validatable via .save()
 * without first fixing the status).
 *
 * Rule applied to every Application currently at status: 'selected':
 *   - If a Task document already exists referencing it (a task was already
 *     assigned under the old flow) -> move it to 'task_assigned' (that's
 *     where it always should have ended up once a task existed).
 *   - Otherwise -> move it back to 'shortlisted' (the new, single gate
 *     before task assignment — exactly the state it needs to be in to show
 *     up on the Task Board's "Assign Task" dropdown again).
 * Both branches push a statusHistory entry with a note explaining the
 * change, so it's visible on the volunteer's own application timeline
 * rather than silently rewriting history.
 *
 * Idempotent and safe to re-run: it only ever touches documents still at
 * status: 'selected', so running it twice (or against a database that
 * never had any) is a no-op the second time.
 *
 * Usage (from the vmsbackend folder):
 *   npm run migrate:remove-selected
 *
 * This is NEVER run automatically on server boot — it's a one-time,
 * explicitly-triggered fix, run once after deploying this change and before
 * (or right after) restarting the server with the new code.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('../models/Application');
const Task = require('../models/Task');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env — nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[migrate] Connected to MongoDB.');

  const stuck = await Application.find({ status: 'selected' });
  console.log(`[migrate] Found ${stuck.length} application(s) at status: 'selected'.`);

  if (stuck.length === 0) {
    console.log('[migrate] Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  let movedToTaskAssigned = 0;
  let movedToShortlisted = 0;

  for (const application of stuck) {
    const existingTask = await Task.findOne({ application: application._id });
    const now = new Date();

    if (existingTask) {
      application.status = 'task_assigned';
      application.statusHistory.push({
        status: 'task_assigned',
        at: now,
        note: "Migrated from 'selected' — a task already existed for this application.",
      });
      movedToTaskAssigned += 1;
    } else {
      application.status = 'shortlisted';
      application.statusHistory.push({
        status: 'shortlisted',
        at: now,
        note: "Migrated from 'selected' — this status was removed; a task can now be assigned directly from Shortlisted.",
      });
      movedToShortlisted += 1;
    }

    await application.save();
    console.log(`[migrate] ${application._id} -> ${application.status}`);
  }

  console.log(
    `[migrate] Done. Moved ${movedToTaskAssigned} to 'task_assigned', ${movedToShortlisted} to 'shortlisted'.`
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrate] Failed:', err);
  process.exit(1);
});
