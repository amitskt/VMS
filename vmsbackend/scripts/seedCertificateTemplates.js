/**
 * One-time seed for the CertificateTemplate gallery, run once when
 * upgrading from the old single-template Settings-page upload
 * (CertificateSettings.certificateTemplate) to the multi-template gallery.
 *
 * Creates up to 4 CertificateTemplate documents:
 *   1. "Classic" (layoutA) — built from whatever CertificateSettings.
 *      certificateTemplate already held (the admin's existing upload), so
 *      the very first template in the gallery is exactly what was already
 *      live. If nothing had been uploaded yet, this template is skipped —
 *      there is nothing to seed it with, and the built-in drawn design
 *      (utils/certificatePdf.js's shape-based fallback) keeps covering
 *      that case exactly as it already did.
 *   2. "Forest" (layoutB / light) — seed/certificate-templates/cr01.jpg
 *   3. "Evergreen" (layoutB / dark) — seed/certificate-templates/cr02.jpg
 *   4. "Emerald" (layoutB / dark) — seed/certificate-templates/cr03.jpg
 *
 * Then sets CertificateSettings.activeTemplateId to whichever of these was
 * already effectively active (the "Classic" one built from the existing
 * upload, or null if there was none) — so running this migration causes NO
 * visible change to what a newly-issued certificate looks like. Admins pick
 * a different template afterward from the Settings page's gallery.
 *
 * Idempotent and safe to re-run: skips any template whose `name` already
 * exists, and only sets activeTemplateId if it's currently unset.
 *
 * Usage (from the vmsbackend folder):
 *   npm run seed:certificate-templates
 *
 * This is NEVER run automatically on server boot — it's a one-time,
 * explicitly-triggered step, run once after deploying this change.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const CertificateTemplate = require('../models/CertificateTemplate');
const CertificateSettings = require('../models/CertificateSettings');

function fileToDataUrl(filePath, mime = 'image/jpeg') {
  const buf = fs.readFileSync(filePath);
  return `data:${mime};base64,${buf.toString('base64')}`;
}

const NEW_TEMPLATES = [
  { name: 'Forest', file: 'cr01.jpg', layout: 'layoutB', palette: 'light' },
  { name: 'Evergreen', file: 'cr02.jpg', layout: 'layoutB', palette: 'dark' },
  { name: 'Emerald', file: 'cr03.jpg', layout: 'layoutB', palette: 'dark' },
];

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env — nothing to connect to.');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[seed-templates] Connected to MongoDB.');

  let defaultTemplateId = null;

  const existingDefault = await CertificateTemplate.findOne({ name: 'Classic' });
  if (existingDefault) {
    console.log('[seed-templates] "Classic" already exists — skipping.');
    defaultTemplateId = existingDefault._id;
  } else {
    const settings = await CertificateSettings.findById('certificate_settings');
    if (settings && settings.certificateTemplate) {
      const created = await CertificateTemplate.create({
        name: 'Classic',
        image: settings.certificateTemplate,
        layout: 'layoutA',
        palette: null,
        isDefault: true,
      });
      defaultTemplateId = created._id;
      console.log('[seed-templates] Created "Classic" from the existing CertificateSettings upload.');
    } else {
      console.log('[seed-templates] No existing CertificateSettings.certificateTemplate to seed "Classic" from — skipped.');
    }
  }

  for (const tpl of NEW_TEMPLATES) {
    const existing = await CertificateTemplate.findOne({ name: tpl.name });
    if (existing) {
      console.log(`[seed-templates] "${tpl.name}" already exists — skipping.`);
      continue;
    }
    const filePath = path.join(__dirname, '..', 'seed', 'certificate-templates', tpl.file);
    if (!fs.existsSync(filePath)) {
      console.warn(`[seed-templates] Missing file ${filePath} — skipping "${tpl.name}".`);
      continue;
    }
    await CertificateTemplate.create({
      name: tpl.name,
      image: fileToDataUrl(filePath),
      layout: tpl.layout,
      palette: tpl.palette,
      isDefault: false,
    });
    console.log(`[seed-templates] Created "${tpl.name}".`);
  }

  const settings = await CertificateSettings.findById('certificate_settings');
  if (settings && !settings.activeTemplateId && defaultTemplateId) {
    settings.activeTemplateId = defaultTemplateId;
    await settings.save();
    console.log('[seed-templates] Set CertificateSettings.activeTemplateId to "Classic" (no visual change for new certificates).');
  } else if (settings && settings.activeTemplateId) {
    console.log('[seed-templates] CertificateSettings.activeTemplateId already set — left as-is.');
  } else if (!settings) {
    console.log('[seed-templates] No CertificateSettings document exists yet — activeTemplateId left unset.');
  }

  console.log('[seed-templates] Done.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[seed-templates] Failed:', err);
  process.exit(1);
});
