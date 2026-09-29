/**
 * Re-syncs the Forest/Evergreen/Emerald CertificateTemplate documents'
 * `image` field from the current seed/certificate-templates/{cr01,cr02,
 * cr03}.jpg files on disk.
 *
 * Why this is needed: scripts/seedCertificateTemplates.js only reads those
 * JPGs ONCE, at first-seed time, and copies their bytes into MongoDB as a
 * base64 `image` field — after that, the document is the source of truth,
 * completely independent of the file on disk. The original cr01/02/03.jpg
 * files had a leftover visual artifact (a faint smudged line under the
 * "Verify at..." area — a remnant of the placeholder text that was
 * inpainted out when these templates were first cleaned up) that's since
 * been fixed on disk, but any org that already ran the seed script is still
 * serving the OLD, un-fixed image straight out of Mongo — this script pushes
 * the corrected file into the existing document, in place, without touching
 * its _id/layout/palette/isDefault or any certificate already pinned to it.
 *
 * Idempotent and safe to re-run: simply overwrites `image` every time with
 * whatever is currently on disk. Does NOT create new templates (that's
 * seedCertificateTemplates.js's job) — a template whose name isn't found is
 * reported and skipped, never created.
 *
 * Already-issued certificates are NOT affected — Application.
 * certificateTemplateId pins a specific CertificateTemplate document, and
 * this only replaces that document's `image`, but any certificate PDF
 * already generated and uploaded to Drive was rendered once and stays
 * exactly as it was output; the certificate PDF isn't laid out from live
 * Mongo data after the fact. This only changes what NEW certificates (and
 * the admin Settings gallery thumbnail) render with going forward.
 *
 * Usage (from the vmsbackend folder):
 *   npm run refresh:certificate-template-images
 *
 * This is NEVER run automatically on server boot.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const CertificateTemplate = require('../models/CertificateTemplate');

function fileToDataUrl(filePath, mime = 'image/jpeg') {
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const TARGETS = [
  { name: 'Forest', file: 'cr01.jpg' },
  { name: 'Evergreen', file: 'cr02.jpg' },
  { name: 'Emerald', file: 'cr03.jpg' },
];

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env — nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[refresh-template-images] Connected to MongoDB.');

  for (const tpl of TARGETS) {
    const filePath = path.join(__dirname, '..', 'seed', 'certificate-templates', tpl.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[refresh-template-images] Missing file ${filePath} — skipping "${tpl.name}".`);
      continue;
    }

    const existing = await CertificateTemplate.findOne({ name: tpl.name });
    if (!existing) {
      console.log(`[refresh-template-images] No CertificateTemplate named "${tpl.name}" exists yet — skipping (run seed:certificate-templates first).`);
      continue;
    }

    existing.image = fileToDataUrl(filePath);
    await existing.save();
    console.log(`[refresh-template-images] Updated "${tpl.name}"'s image from ${tpl.file}.`);
  }

  console.log('[refresh-template-images] Done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[refresh-template-images] Failed:', err);
  process.exit(1);
});
