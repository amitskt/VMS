/**
 * One-time setup script — run this once from your own machine, signed in
 * as amit@sankalptaru.org, to get the GOOGLE_DRIVE_REFRESH_TOKEN that
 * utils/driveUpload.js needs. There is no way to do this step for you: it
 * requires an interactive Google consent screen in a real browser.
 *
 * Prerequisites (do these first in Google Cloud Console — console.cloud.google.com):
 *   1. Create/select a project, then enable the "Google Drive API"
 *      (APIs & Services -> Library -> search "Google Drive API" -> Enable).
 *   2. APIs & Services -> Credentials -> Create Credentials -> OAuth client ID
 *      -> Application type: "Desktop app". Copy the Client ID and Client Secret.
 *   3. Put those two values into vmsbackend/.env as GOOGLE_DRIVE_CLIENT_ID
 *      and GOOGLE_DRIVE_CLIENT_SECRET.
 *   4. In Google Drive (drive.google.com), create or pick the folder you
 *      want uploads to land in, open it, and copy the ID from its URL:
 *      https://drive.google.com/drive/folders/<THIS_PART_IS_THE_ID>
 *      Put that into .env as GOOGLE_DRIVE_FOLDER_ID.
 *
 * Then run, from the vmsbackend folder:
 *   node scripts/getGoogleDriveToken.js
 *
 * It prints a URL — open it in a browser where you are signed in as
 * amit@sankalptaru.org, click Allow, and you'll be redirected back to a
 * localhost page this script is listening on. The refresh token then prints
 * in this terminal — paste it into .env as GOOGLE_DRIVE_REFRESH_TOKEN and
 * restart the backend. You only need to do this once; the refresh token
 * doesn't expire from normal use.
 */

require('dotenv').config();
const http = require('http');
const { URL } = require('url');
const { google } = require('googleapis');

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

async function main() {
  const { GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET } = process.env;
  if (!GOOGLE_DRIVE_CLIENT_ID || !GOOGLE_DRIVE_CLIENT_SECRET) {
    console.error(
      '\nMissing GOOGLE_DRIVE_CLIENT_ID / GOOGLE_DRIVE_CLIENT_SECRET in .env.\n' +
        'Create an OAuth 2.0 "Desktop app" client in Google Cloud Console first — see the comment at the top of this file.\n'
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, REDIRECT_URI);

  // drive.file (not the broader "drive" scope) — this app only ever needs
  // to create new files in one folder and read back what it created, never
  // browse or touch the rest of the account's Drive.
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent', // forces a refresh_token even if this client was authorized before
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });

  console.log('\n1. Open this URL in a browser, signed in as amit@sankalptaru.org:\n');
  console.log(authUrl);
  console.log('\n2. Click Allow. This script is waiting for the redirect...\n');

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, REDIRECT_URI);
      if (url.pathname !== '/oauth2callback') {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get('error');
      const authCode = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(
        err
          ? '<h2>Something went wrong. You can close this tab and check the terminal.</h2>'
          : '<h2>Done — you can close this tab and go back to the terminal.</h2>'
      );
      server.close();
      if (err) reject(new Error(err));
      else resolve(authCode);
    });
    server.listen(PORT);
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error(
      '\nGoogle did not return a refresh token. This usually means this client already had one issued before.\n' +
        'Go to https://myaccount.google.com/permissions, remove access for this app, and run this script again.\n'
    );
    process.exit(1);
  }

  console.log('\nSuccess! Add this line to vmsbackend/.env, then restart the backend:\n');
  console.log(`GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
}

main().catch((err) => {
  console.error('\nSetup failed:', err.message, '\n');
  process.exit(1);
});
