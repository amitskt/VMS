/**
 * One-time migration: marks every EXISTING volunteer account as
 * isEmailVerified: true.
 *
 * Why this is required, not optional: isEmailVerified defaults to false on
 * the schema (see models/Volunteer.js), and login() now refuses to sign in
 * any account where it's false (see controllers/volunteerAuthController.js).
 * Every volunteer who registered with email/password BEFORE this feature
 * shipped never went through an OTP step, so without this migration every
 * one of them would be locked out of their own account the next time they
 * try to log in.
 *
 * This backfill sets isEmailVerified: true for ALL volunteers currently in
 * the database (both email/password and Google accounts) — anyone who
 * already has a working account today is treated as already verified.
 * Only NEW registrations from this point forward go through the email
 * verification OTP flow.
 *
 * Idempotent and safe to re-run: only ever touches documents where
 * isEmailVerified is not already true.
 *
 * Usage (from the vmsbackend folder, run this ONCE right after deploying
 * the email-verification feature, BEFORE any volunteer tries to log in):
 *   npm run backfill:email-verified
 *
 * This is NEVER run automatically on server boot.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Volunteer = require('../models/Volunteer');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env — nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[backfill-email-verified] Connected to MongoDB.');

  const unverifiedCount = await Volunteer.countDocuments({ isEmailVerified: { $ne: true } });
  console.log(`[backfill-email-verified] Found ${unverifiedCount} existing volunteer account(s) not yet marked verified.`);

  if (unverifiedCount === 0) {
    console.log('[backfill-email-verified] Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const result = await Volunteer.updateMany(
    { isEmailVerified: { $ne: true } },
    { $set: { isEmailVerified: true } }
  );

  console.log(`[backfill-email-verified] Marked ${result.modifiedCount} existing volunteer account(s) as email-verified.`);
  await mongoose.disconnect();
  console.log('[backfill-email-verified] Done.');
}

run().catch((err) => {
  console.error('[backfill-email-verified] Failed:', err);
  process.exit(1);
});
