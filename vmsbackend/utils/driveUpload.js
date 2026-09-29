const { google } = require('googleapis');
const crypto = require('crypto');
const path = require('path');
const { Readable } = require('stream');

/**
 * Uploads a file buffer into amit@sankalptaru.org's own Google Drive, and
 * returns a link anyone can open.
 *
 * This is a plain OAuth2 "sign in as one specific real person" setup, not a
 * service account — a service account was tried first, but it turned out
 * this Google account/plan has no Shared Drives (required for a service
 * account to upload anything at all — service accounts have zero personal
 * storage quota and can't write into a regular My Drive folder even when
 * it's shared with them as Editor). OAuth sign-in has no such requirement:
 * it authenticates as the real person, so it can write into any folder
 * they can already see, on any Google account/plan.
 *
 * uploadBuffer(buffer, originalName, mimeType, folder, parentFolderId?) ->
 * {url, key} — same signature every existing caller
 * (volunteerApplicationController.submitTrackA, volunteerTaskController.
 * submitTask, opportunityController, etc.) already uses, with one new
 * optional 5th argument. Omitted, uploads land in the single flat
 * GOOGLE_DRIVE_FOLDER_ID destination exactly as before. Passed, uploads
 * land inside that specific Drive folder instead — see
 * uploadBufferForVolunteer() below, which resolves a volunteer's own
 * subfolder and calls this with it.
 *
 * PER-VOLUNTEER SUBFOLDERS: added so a volunteer's profile photo, resume,
 * certificates, and Track A/Task submission proof all end up in one
 * findable place — a folder named after their email, nested under
 * GOOGLE_DRIVE_FOLDER_ID. getOrCreateVolunteerFolder() finds-or-creates
 * that folder (Drive doesn't enforce unique folder names, so a
 * find-first-then-create-if-missing lookup, not a blind create, is what
 * actually keeps it to one folder per volunteer across repeated uploads).
 * Issued certificates go one level deeper still, into a 'certificates'
 * subfolder inside that same volunteer folder (see
 * getOrCreateVolunteerSubfolder() below) so they don't get lost in the same
 * listing as the profile photo/resume/proof photos. Opportunity-level
 * documents (not tied to one specific volunteer) are unaffected and stay in
 * the flat root folder exactly as before.
 *
 * Needs 4 vars in .env — see .env.example:
 *   GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET — an OAuth 2.0
 *     "Desktop app" client from Google Cloud Console.
 *   GOOGLE_DRIVE_REFRESH_TOKEN — obtained once by running
 *     `npm run drive:auth` (scripts/getGoogleDriveToken.js), signed in as
 *     amit@sankalptaru.org.
 *   GOOGLE_DRIVE_FOLDER_ID — the destination folder's ID, from its Drive URL.
 *
 * Like GEMINI_API_KEY before it, this file can't write .env for you — add
 * the real values yourself and restart the server. Until then, any upload
 * attempt fails with a clear 500 rather than a confusing SDK stack trace.
 *
 * One important gotcha for a personal (non-Workspace-Shared-Drive) folder:
 * a file uploaded via the API is private by default, so anyone who isn't
 * amit@sankalptaru.org (other admins, managers, the volunteer who submitted
 * it) would get a 403 opening the stored link. To avoid that, every upload
 * is immediately given an "anyone with the link can view" permission — see
 * makeViewableByAnyone() below.
 */

let cachedDrive = null;

function getDrive() {
  if (cachedDrive) return cachedDrive;
  const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET || !GOOGLE_DRIVE_REFRESH_TOKEN) {
    const err = new Error(
      'File storage is not configured on the server yet (missing GOOGLE_DRIVE_* in .env). Ask an admin to finish setup.'
    );
    err.status = 500;
    throw err;
  }
  const oauth2Client = new google.auth.OAuth2(GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN });
  cachedDrive = google.drive({ version: 'v3', auth: oauth2Client });
  return cachedDrive;
}

// Personal-Drive files default to private — this is what makes the stored
// link actually openable by whoever needs it (any staff reviewing a
// submission, not just amit@sankalptaru.org). Best-effort: if it fails, the
// file is still uploaded and the link is returned, just possibly not yet
// public — logged rather than thrown so one Drive hiccup doesn't fail the
// whole submission.
async function makeViewableByAnyone(drive, fileId) {
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: 'reader', type: 'anyone' },
    });
  } catch (err) {
    console.error(`Could not make Drive file ${fileId} viewable by anyone:`, err.message);
  }
}

// In-process cache of email -> Drive folder ID, so a volunteer who uploads
// several files in the same server lifetime (photo, then resume, then a
// certificate later) doesn't re-search Drive every time. Not persisted —
// safe to lose on restart, since getOrCreateVolunteerFolder() always
// searches before creating, so a cold cache just costs one extra Drive API
// call, never a duplicate folder.
const volunteerFolderCache = new Map();

// Escapes a value for safe interpolation into a Drive API `q` string —
// Drive's query language treats backslash and single-quote specially
// inside a quoted string literal (see
// https://developers.google.com/drive/api/guides/search-files), and an
// email address can't contain either character anyway, but this keeps the
// query well-formed even if a future volunteerKey (a name fallback, say)
// does.
function escapeDriveQueryValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Finds this volunteer's Drive subfolder (named after their email) under
// the root GOOGLE_DRIVE_FOLDER_ID, creating it on first use. `volunteerKey`
// is expected to be the volunteer's email — unique per account and already
// how they're identified everywhere else in this app (login, notifications).
async function getOrCreateVolunteerFolder(volunteerKey) {
  if (!volunteerKey) {
    const err = new Error('A volunteer identifier (email) is required to resolve their Drive folder.');
    err.status = 500;
    throw err;
  }
  if (volunteerFolderCache.has(volunteerKey)) {
    return volunteerFolderCache.get(volunteerKey);
  }

  const { GOOGLE_DRIVE_FOLDER_ID } = process.env;
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    const err = new Error('File storage is not configured on the server yet (missing GOOGLE_DRIVE_FOLDER_ID in .env).');
    err.status = 500;
    throw err;
  }
  const drive = getDrive();
  const escaped = escapeDriveQueryValue(volunteerKey);

  const { data: existing } = await drive.files.list({
    q: `'${GOOGLE_DRIVE_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  let folderId;
  if (existing.files && existing.files.length > 0) {
    folderId = existing.files[0].id;
  } else {
    const { data: created } = await drive.files.create({
      requestBody: {
        name: volunteerKey,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [GOOGLE_DRIVE_FOLDER_ID],
      },
      fields: 'id',
    });
    folderId = created.id;
  }

  volunteerFolderCache.set(volunteerKey, folderId);
  return folderId;
}

// In-process cache of "email::subfolderName" -> Drive folder ID, mirroring
// volunteerFolderCache above but for a named subfolder nested inside a
// volunteer's own folder (currently just 'certificates' — see
// utils/certificateData.js's uploadCertificateToDrive).
const volunteerSubfolderCache = new Map();

// Finds-or-creates a named subfolder (e.g. 'certificates') nested inside a
// volunteer's own Drive folder — same find-before-create pattern as
// getOrCreateVolunteerFolder() above, so repeated calls never create
// duplicate subfolders either.
async function getOrCreateVolunteerSubfolder(volunteerKey, subfolderName) {
  if (!subfolderName) {
    const err = new Error('A subfolder name is required to resolve a volunteer subfolder.');
    err.status = 500;
    throw err;
  }
  const cacheKey = `${volunteerKey}::${subfolderName}`;
  if (volunteerSubfolderCache.has(cacheKey)) {
    return volunteerSubfolderCache.get(cacheKey);
  }

  const parentFolderId = await getOrCreateVolunteerFolder(volunteerKey);
  const drive = getDrive();
  const escaped = escapeDriveQueryValue(subfolderName);

  const { data: existing } = await drive.files.list({
    q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${escaped}' and trashed=false`,
    fields: 'files(id, name)',
    pageSize: 1,
  });

  let folderId;
  if (existing.files && existing.files.length > 0) {
    folderId = existing.files[0].id;
  } else {
    const { data: created } = await drive.files.create({
      requestBody: {
        name: subfolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      },
      fields: 'id',
    });
    folderId = created.id;
  }

  volunteerSubfolderCache.set(cacheKey, folderId);
  return folderId;
}

// folder: a short prefix ('tasks', 'track-a', 'photo', 'resume', 'certificate')
// to keep uploads identifiable in the destination folder's file list —
// purely cosmetic, doesn't affect access. parentFolderId overrides the
// default flat GOOGLE_DRIVE_FOLDER_ID destination — see
// uploadBufferForVolunteer() below for the per-volunteer-subfolder case.
async function uploadBuffer(buffer, originalName, mimeType, folder, parentFolderId) {
  const { GOOGLE_DRIVE_FOLDER_ID } = process.env;
  const parent = parentFolderId || GOOGLE_DRIVE_FOLDER_ID;
  if (!parent) {
    const err = new Error('File storage is not configured on the server yet (missing GOOGLE_DRIVE_FOLDER_ID in .env).');
    err.status = 500;
    throw err;
  }
  const drive = getDrive();
  const ext = path.extname(originalName || '') || '';
  const base = path.basename(originalName || 'file', ext);
  const name = `${folder}_${Date.now()}-${crypto.randomBytes(6).toString('hex')}_${base}${ext}`;

  const { data } = await drive.files.create({
    requestBody: { name, parents: [parent] },
    media: { mimeType: mimeType || 'application/octet-stream', body: Readable.from(buffer) },
    fields: 'id, webViewLink',
  });

  await makeViewableByAnyone(drive, data.id);

  return { url: data.webViewLink, key: data.id };
}

// Convenience wrapper for the per-volunteer-folder case (profile photo,
// resume, certificates, Track A/Task submission proof — see
// controllers/volunteerController.js, utils/certificateData.js,
// controllers/volunteerApplicationController.js, controllers/
// volunteerTaskController.js). Resolves/creates the volunteer's own
// folder, then uploads into it — everything else identical to
// uploadBuffer(). Pass subfolderName (e.g. 'certificates') to instead land
// the file in a named subfolder nested inside the volunteer's folder — see
// getOrCreateVolunteerSubfolder() above.
async function uploadBufferForVolunteer(buffer, originalName, mimeType, folder, volunteerEmail, subfolderName) {
  const parentFolderId = subfolderName
    ? await getOrCreateVolunteerSubfolder(volunteerEmail, subfolderName)
    : await getOrCreateVolunteerFolder(volunteerEmail);
  return uploadBuffer(buffer, originalName, mimeType, folder, parentFolderId);
}

// Downloads a previously-uploaded file's raw bytes back from Drive — used
// by geminiMatcher.js so Gemini can actually read a volunteer's resume
// (PDF) when scoring Track B matches, rather than matching on skills alone.
// A read, not a write, so unlike uploadBuffer() it never touches permissions.
async function downloadBuffer(fileId) {
  const drive = getDrive();
  const res = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
  return Buffer.from(res.data);
}

// Re-parents an already-uploaded file into a different Drive folder,
// keeping its file ID (and therefore its webViewLink) unchanged — used by
// scripts/backfillVolunteerDriveFolders.js to move a volunteer's
// already-uploaded resume from the old flat root folder into their new
// per-volunteer subfolder without re-uploading it (no duplicate storage,
// and Volunteer.resumeUrl/resumeKey in Mongo never need to change since
// the file ID is the same).
async function moveFileToFolder(fileId, newParentFolderId) {
  const drive = getDrive();
  const { data } = await drive.files.get({ fileId, fields: 'parents' });
  const previousParents = (data.parents || []).join(',');
  await drive.files.update({
    fileId,
    addParents: newParentFolderId,
    removeParents: previousParents,
    fields: 'id, parents',
  });
}

// Removes a file from Drive entirely — used when a manager deletes one of
// an opportunity's related documents. Best-effort on a 404: if the file was
// already gone from Drive (deleted manually, etc.) this doesn't throw,
// since the caller's real goal — the document no longer being listed on
// this opportunity — is achieved either way.
async function deleteFile(fileId) {
  const drive = getDrive();
  try {
    await drive.files.delete({ fileId });
  } catch (err) {
    if (err.code !== 404) throw err;
  }
}

module.exports = { uploadBuffer, uploadBufferForVolunteer, getOrCreateVolunteerFolder, getOrCreateVolunteerSubfolder, moveFileToFolder, downloadBuffer, deleteFile };
