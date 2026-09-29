/**
 * One-time fix + hardening script for the per-volunteer Drive folder
 * scheme (see utils/driveUpload.js's getOrCreateVolunteerFolder) after
 * switching which Google account the backend uploads as (amit@sankalptaru.org
 * -> volunteering@sankalptaru.org, or similar).
 *
 * WHY THIS IS NEEDED: getOrCreateVolunteerFolder() always searches for an
 * existing folder named after the volunteer's email before creating a new
 * one — but that search only finds folders the CURRENTLY AUTHENTICATED
 * account (whichever GOOGLE_DRIVE_REFRESH_TOKEN is in .env right now) can
 * actually see. Sharing the root "Volunteers" folder with a new account is
 * supposed to cascade access down to everything inside it, but in practice
 * a folder that already existed before the new share was granted can end
 * up NOT visible to the new account's search — Drive folders can carry
 * their own separate access list rather than always live-inheriting from
 * an ancestor. The result: the new account's very first upload for an
 * existing volunteer creates a SECOND folder with the same name instead of
 * reusing the original, splitting that volunteer's files across two
 * places.
 *
 * WHAT THIS SCRIPT DOES, in two independent passes:
 *
 *   1. MERGE DUPLICATES — lists every direct child folder of
 *      GOOGLE_DRIVE_FOLDER_ID, groups them by name, and for any name with
 *      more than one folder: keeps the OLDEST one (by createdTime) as
 *      canonical, moves every file out of the newer duplicate(s) into it,
 *      then deletes the now-empty duplicate folder(s). Nothing is ever
 *      deleted with files still inside it.
 *
 *   2. RE-SHARE — (only if --share-with=<email> is passed) explicitly
 *      grants that email Editor (writer) access on every top-level
 *      volunteer folder directly, rather than relying on inheritance from
 *      the root. This is belt-and-suspenders: it guarantees the account
 *      the backend authenticates as can always find every volunteer's
 *      folder by search, regardless of Drive's inheritance behavior.
 *
 * SAFE BY DEFAULT: with no flags, this only PRINTS what it would do and
 * changes nothing. Pass --apply to actually perform the moves/
 * deletes/shares. Always run without --apply first and read the output.
 *
 * Usage (from the vmsbackend folder):
 *   node scripts/fixVolunteerDriveFolders.js                                   # dry run, merges only
 *   node scripts/fixVolunteerDriveFolders.js --apply                           # actually merge duplicates
 *   node scripts/fixVolunteerDriveFolders.js --share-with=volunteering@sankalptaru.org            # dry run, merges + shows sharing plan
 *   node scripts/fixVolunteerDriveFolders.js --share-with=volunteering@sankalptaru.org --apply     # actually merge AND share
 *
 * This uses whatever GOOGLE_DRIVE_* credentials are currently in .env — so
 * run it AFTER you've already switched GOOGLE_DRIVE_REFRESH_TOKEN to the
 * new account (that account needs to be able to see/access the root
 * folder and every volunteer subfolder for this to work; if it's missing
 * some, --share-with's whole point is fixing that going forward, but the
 * MERGE pass still needs to be able to see both duplicates to merge them —
 * if it can't see one side, run this once as the OLD account first to do
 * the share, or share manually as described in chat, then re-run as the
 * NEW account).
 *
 * This is NEVER run automatically on server boot.
 */

require('dotenv').config();
const { google } = require('googleapis');

const APPLY = process.argv.includes('--apply');
const SHARE_WITH = process.argv.find((a) => a.startsWith('--share-with='))?.split('=')[1] || null;

function getDrive() {
  const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, GOOGLE_DRIVE_REFRESH_TOKEN } = process.env;
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET || !GOOGLE_DRIVE_REFRESH_TOKEN) {
    console.error('Missing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN in .env.');
    process.exit(1);
  }
  const oauth2Client = new google.auth.OAuth2(GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET);
  oauth2Client.setCredentials({ refresh_token: GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth: oauth2Client });
}

async function listAllChildFolders(drive, parentId) {
  const all = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken, files(id, name, createdTime, owners(emailAddress))',
      pageSize: 1000,
      pageToken,
    });
    all.push(...(data.files || []));
    pageToken = data.nextPageToken;
  } while (pageToken);
  return all;
}

async function main() {
  const { GOOGLE_DRIVE_FOLDER_ID } = process.env;
  if (!GOOGLE_DRIVE_FOLDER_ID) {
    console.error('Missing GOOGLE_DRIVE_FOLDER_ID in .env.');
    process.exit(1);
  }

  const drive = getDrive();
  const about = await drive.about.get({ fields: 'user(emailAddress)' });
  console.log(`Authenticated as: ${about.data.user.emailAddress}`);
  console.log(`Mode: ${APPLY ? 'APPLY (will make real changes)' : 'DRY RUN (no changes will be made — pass --apply to actually do this)'}\n`);

  const folders = await listAllChildFolders(drive, GOOGLE_DRIVE_FOLDER_ID);
  console.log(`Found ${folders.length} volunteer folder(s) directly under the root.\n`);

  const byName = new Map();
  for (const f of folders) {
    if (!byName.has(f.name)) byName.set(f.name, []);
    byName.get(f.name).push(f);
  }

  // --- Pass 1: merge duplicates ---
  const duplicateNames = [...byName.entries()].filter(([, list]) => list.length > 1);
  console.log(`--- MERGE: ${duplicateNames.length} volunteer name(s) have duplicate folders ---`);

  for (const [name, list] of duplicateNames) {
    const sorted = [...list].sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
    const keep = sorted[0];
    const extras = sorted.slice(1);
    console.log(`\n"${name}":`);
    console.log(`  KEEP    ${keep.id}  created ${keep.createdTime}  owner ${keep.owners?.[0]?.emailAddress || '?'}`);

    for (const dup of extras) {
      console.log(`  MERGE   ${dup.id}  created ${dup.createdTime}  owner ${dup.owners?.[0]?.emailAddress || '?'}`);
      const { data: children } = await drive.files.list({
        q: `'${dup.id}' in parents and trashed=false`,
        fields: 'files(id, name)',
        pageSize: 1000,
      });
      for (const child of children.files || []) {
        console.log(`    - move "${child.name}" (${child.id}) -> ${keep.id}`);
        if (APPLY) {
          await drive.files.update({
            fileId: child.id,
            addParents: keep.id,
            removeParents: dup.id,
            fields: 'id, parents',
          });
        }
      }
      console.log(`    - delete now-empty duplicate folder ${dup.id}`);
      if (APPLY) {
        await drive.files.delete({ fileId: dup.id });
      }
    }
  }

  if (duplicateNames.length === 0) {
    console.log('Nothing to merge.');
  }

  // --- Pass 2: explicit re-share (optional) ---
  if (SHARE_WITH) {
    console.log(`\n--- SHARE: granting ${SHARE_WITH} Editor access directly on every volunteer folder ---`);
    const canonical = [...byName.values()].map((list) => {
      const sorted = [...list].sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime));
      return sorted[0];
    });
    for (const folder of canonical) {
      console.log(`  share "${folder.name}" (${folder.id})`);
      if (APPLY) {
        try {
          await drive.permissions.create({
            fileId: folder.id,
            requestBody: { role: 'writer', type: 'user', emailAddress: SHARE_WITH },
            sendNotificationEmail: false,
          });
        } catch (err) {
          console.error(`    ! failed: ${err.message}`);
        }
      }
    }
  } else {
    console.log('\n(--share-with=<email> not passed — skipping the re-share pass. Run again with it once you\'ve confirmed the merge looks right.)');
  }

  console.log(`\nDone.${APPLY ? '' : ' This was a dry run — re-run with --apply to actually make these changes.'}`);
}

main().catch((err) => {
  console.error('Failed:', err.message);
  if (err.response?.data) console.error(JSON.stringify(err.response.data, null, 2));
  process.exit(1);
});
