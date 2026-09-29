/**
 * One-time backfill: gives every EXISTING volunteer a per-volunteer Drive
 * subfolder (named after their email, under GOOGLE_DRIVE_FOLDER_ID — see
 * utils/driveUpload.js's getOrCreateVolunteerFolder) and populates it with
 * whatever of their profile photo / resume / issued certificates already
 * exist, so a volunteer who joined before this feature shipped ends up
 * with the same organized folder a volunteer signing up after it ships
 * gets automatically (see controllers/volunteerController.js's
 * updateProfile/uploadResume, utils/certificateData.js's
 * uploadCertificateToDrive).
 *
 * Explicitly requested to run for ALL volunteers immediately (not just
 * going forward) — see the "All volunteers now" decision.
 *
 * Certificates specifically live one level deeper, in a 'certificates'
 * subfolder inside the volunteer's folder (see utils/driveUpload.js's
 * getOrCreateVolunteerSubfolder) — added after the initial version of this
 * script shipped, so this also re-parents any certificate this script (or a
 * fresh issuance) already uploaded to the volunteer's root folder into that
 * subfolder, keeping every issued certificate in the same place regardless
 * of when it was backfilled.
 *
 * For each volunteer, per document type:
 *   - Profile photo: only if Volunteer.photoUrl is still a base64 data URL
 *     (an old upload, stored directly in Mongo before this change) — it's
 *     uploaded to their Drive folder and photoUrl is replaced with the
 *     resulting Drive link, same as a fresh photo save now does. A photo
 *     that's already an https:// Drive URL (already backfilled, or
 *     uploaded after this code shipped) is left untouched.
 *   - Resume: only if Volunteer.resumeKey is set and not yet inside this
 *     volunteer's folder — the EXISTING Drive file is re-parented in place
 *     (utils/driveUpload.js's moveFileToFolder), not re-uploaded, so its
 *     resumeUrl/resumeKey never change and nothing else that already
 *     references that link breaks.
 *   - Certificates: every Application with certificateIssued: true and no
 *     certificateDriveUrl yet gets its certificate PDF generated (with
 *     whatever template that specific certificate is pinned to or resolves
 *     to — see utils/certificateData.js) and uploaded into the volunteer's
 *     folder, exactly like a fresh issuance does.
 *
 * Run scripts/seedCertificateTemplates.js and
 * scripts/migratePinCertificateTemplates.js BEFORE this one — certificates
 * backfilled here render with whatever template resolveCertificateTemplate
 * finds at the time this runs, and running the pin migration first ensures
 * that's each certificate's own frozen template rather than today's active
 * one for every old certificate alike.
 *
 * Idempotent and safe to re-run: every step checks its own "already done"
 * condition first (an https:// photoUrl, a resume whose current parent is
 * already the volunteer's folder, an Application with certificateDriveUrl
 * already set) and skips it. Safe to stop partway through (Ctrl+C) and
 * re-run later — nothing is re-uploaded, nothing is duplicated.
 *
 * This can take a while for a large volunteer base — it's a real Drive API
 * call (sometimes two or three) per volunteer, run sequentially to stay
 * well under Drive's per-user rate limits rather than firing everything at
 * once.
 *
 * Usage (from the vmsbackend folder):
 *   npm run backfill:volunteer-drive-folders
 *
 * This is NEVER run automatically on server boot.
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Volunteer = require('../models/Volunteer');
const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const {
  getOrCreateVolunteerFolder,
  getOrCreateVolunteerSubfolder,
  uploadBufferForVolunteer,
  moveFileToFolder,
} = require('../utils/driveUpload');
const { buildCertificateData } = require('../utils/certificateData');
const { generateCertificatePdfBuffer } = require('../utils/certificatePdf');

function decodeImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

async function backfillPhoto(volunteer) {
  const decoded = decodeImageDataUrl(volunteer.photoUrl);
  if (!decoded) return { action: 'skipped' };
  const { url } = await uploadBufferForVolunteer(
    decoded.buffer,
    `photo.${decoded.mimeType.split('/')[1]}`,
    decoded.mimeType,
    'photo',
    volunteer.email
  );
  volunteer.photoUrl = url;
  await volunteer.save();
  return { action: 'uploaded' };
}

async function backfillResume(volunteer, folderId) {
  if (!volunteer.resumeKey) return { action: 'skipped', reason: 'no resume' };
  try {
    await moveFileToFolder(volunteer.resumeKey, folderId);
    return { action: 'moved' };
  } catch (err) {
    return { action: 'failed', reason: err.message };
  }
}

async function backfillCertificates(volunteer, certFolderId) {
  const toUpload = await Application.find({
    volunteer: volunteer._id,
    certificateIssued: true,
    certificateDriveUrl: null,
  }).populate('opportunity');

  let uploaded = 0;
  let failed = 0;
  for (const application of toUpload) {
    if (!application.opportunity) continue; // opportunity was deleted — nothing to render
    try {
      const cert = await buildCertificateData(application, application.opportunity, volunteer);
      const pdfBuffer = await generateCertificatePdfBuffer(cert);
      const { url, key } = await uploadBufferForVolunteer(
        pdfBuffer,
        `${cert.certificateId}.pdf`,
        'application/pdf',
        'certificate',
        volunteer.email,
        'certificates'
      );
      application.certificateDriveUrl = url;
      application.certificateDriveKey = key;
      await application.save();
      uploaded += 1;
    } catch (err) {
      failed += 1;
      console.error(`[backfill-drive]   certificate ${application._id} failed:`, err.message);
    }
  }

  // Re-parent any already-uploaded certificate (from a run before the
  // certificates/ subfolder existed, or a fresh issuance from before this
  // change shipped) into the subfolder too. Safe/idempotent to re-run —
  // Drive just no-ops a redundant parent change on a file already there.
  const toReorganize = await Application.find({
    volunteer: volunteer._id,
    certificateIssued: true,
    certificateDriveKey: { $ne: null },
  }).select('certificateDriveKey');

  let reorganized = 0;
  for (const application of toReorganize) {
    try {
      await moveFileToFolder(application.certificateDriveKey, certFolderId);
      reorganized += 1;
    } catch (err) {
      console.error(`[backfill-drive]   could not move certificate ${application._id} into certificates/ folder:`, err.message);
    }
  }

  return { uploaded, failed, total: toUpload.length, reorganized };
}

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is not set in .env — nothing to connect to.');
    process.exit(1);
  }
  const requiredDriveVars = ['GOOGLE_DRIVE_CLIENT_ID', 'GOOGLE_DRIVE_CLIENT_SECRET', 'GOOGLE_DRIVE_REFRESH_TOKEN', 'GOOGLE_DRIVE_FOLDER_ID'];
  const missing = requiredDriveVars.filter((v) => !process.env[v]);
  if (missing.length) {
    console.error(`[backfill-drive] Missing Drive config in .env: ${missing.join(', ')}`);
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('[backfill-drive] Connected to MongoDB.');

  const volunteers = await Volunteer.find().select('firstName lastName email photoUrl resumeKey resumeUrl');
  console.log(`[backfill-drive] Found ${volunteers.length} volunteer(s).`);

  let photosUploaded = 0;
  let resumesMoved = 0;
  let certsUploaded = 0;
  let certsFailed = 0;
  let certsReorganized = 0;

  for (let i = 0; i < volunteers.length; i += 1) {
    const volunteer = volunteers[i];
    const label = `[${i + 1}/${volunteers.length}] ${volunteer.email}`;
    try {
      const folderId = await getOrCreateVolunteerFolder(volunteer.email);
      const certFolderId = await getOrCreateVolunteerSubfolder(volunteer.email, 'certificates');

      const photoResult = await backfillPhoto(volunteer);
      if (photoResult.action === 'uploaded') photosUploaded += 1;

      const resumeResult = await backfillResume(volunteer, folderId);
      if (resumeResult.action === 'moved') resumesMoved += 1;

      const certResult = await backfillCertificates(volunteer, certFolderId);
      certsUploaded += certResult.uploaded;
      certsFailed += certResult.failed;
      certsReorganized += certResult.reorganized;

      console.log(
        `[backfill-drive] ${label} — photo: ${photoResult.action}${photoResult.reason ? ` (${photoResult.reason})` : ''}, ` +
          `resume: ${resumeResult.action}${resumeResult.reason ? ` (${resumeResult.reason})` : ''}, ` +
          `certificates: ${certResult.uploaded}/${certResult.total} uploaded` +
          (certResult.failed ? ` (${certResult.failed} failed)` : '') +
          (certResult.reorganized ? `, ${certResult.reorganized} moved into certificates/` : '')
      );
    } catch (err) {
      console.error(`[backfill-drive] ${label} — FAILED:`, err.message);
    }
  }

  console.log(
    `[backfill-drive] Done. Photos uploaded: ${photosUploaded}. Resumes moved: ${resumesMoved}. ` +
      `Certificates uploaded: ${certsUploaded} (${certsFailed} failed). Certificates moved into certificates/ folder: ${certsReorganized}.`
  );

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('[backfill-drive] Failed:', err);
  process.exit(1);
});
