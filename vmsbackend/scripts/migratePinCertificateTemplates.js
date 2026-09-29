/**
 * One-time migration: pins every already-issued certificate (Application
 * with certificateIssued: true and no certificateTemplateId yet) to the
 * template that was effectively active at the time this migration runs —
 * CertificateSettings.activeTemplateId if set, otherwise the "Classic"
 * CertificateTemplate seeded from the legacy certificateTemplate field
 * (see scripts/seedCertificateTemplates.js — run that FIRST).
 *
 * Why this is needed: Application.certificateTemplateId is only ever set
 * going forward, at issuance time (see utils/certificateData.js's
 * pinActiveCertificateTemplate, called from adminApplicationController.js /
 * adminTaskController.js / volunteerApplicationController.js). Every
 * certificate issued BEFORE that code shipped has no value there at all.
 * Without this migration those certificates would keep working correctly
 * anyway — utils/certificateData.js's resolveCertificateTemplate falls back
 * to the current active template when certificateTemplateId is unset — but
 * that fallback means an old certificate's look WOULD silently change the
 * next time an admin switches the active template, breaking the "already
 * -issued certificates never change" guarantee the rest of this feature
 * relies on. Running this once, right after seeding, freezes all of today's
 * already-issued certificates to today's template permanently, matching
 * exactly how they already look — visually a no-op, but it closes that gap
 * for every certificate issued from this point forward.
 *
 * Idempotent and safe to re-run: only ever touches Applications with
 * certificateIssued: true and certificateTemplateId still unset, so a
 * second run (or a database with nothing left to migrate) is a no-op.
 *
 * Usage (from the vmsbackend folder, AFTER seed:certificate-templates):
 *   npm run migrate:pin-certificate-templates
 *
 * This is NEVER run automatically on server boot.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('../models/Application');
const CertificateSettings = require('../models/CertificateSettings');
const CertificateTemplate = require('../models/CertificateTemplate');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env — nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[migrate-pin] Connected to MongoDB.');

  const settings = await CertificateSettings.findById('certificate_settings');
  let templateId = settings?.activeTemplateId || null;

  if (!templateId) {
    const classic = await CertificateTemplate.findOne({ name: 'Classic' });
    templateId = classic?._id || null;
  }

  if (!templateId) {
    console.log(
      '[migrate-pin] No active template and no "Classic" template found — nothing to pin to. ' +
        'Run "npm run seed:certificate-templates" first if you expected one.'
    );
    await mongoose.disconnect();
    return;
  }

  const unpinned = await Application.find({ certificateIssued: true, certificateTemplateId: null });
  console.log(`[migrate-pin] Found ${unpinned.length} already-issued certificate(s) with no pinned template.`);

  if (unpinned.length === 0) {
    console.log('[migrate-pin] Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const result = await Application.updateMany(
    { certificateIssued: true, certificateTemplateId: null },
    { $set: { certificateTemplateId: templateId } }
  );

  console.log(`[migrate-pin] Pinned ${result.modifiedCount} certificate(s) to template ${templateId}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[migrate-pin] Failed:', err);
  process.exit(1);
});
