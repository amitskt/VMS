const { SESClient } = require('@aws-sdk/client-ses');
const awsSes = require('@aws-sdk/client-ses');
const nodemailer = require('nodemailer');

/**
 * Thin wrapper around Amazon SES for every transactional email this app
 * sends to volunteers (see utils/emailTemplates.js for the actual copy, and
 * utils/notifyVolunteer.js for the 5 trigger points that call this). Built
 * on nodemailer's SES transport rather than calling SES's SendEmail API
 * directly, for one specific reason: SendEmail (SES v1-style) cannot carry
 * MIME attachments at all — only SendRawEmail can, and nodemailer already
 * knows how to build a correctly-formed raw MIME message (including the
 * certificate PDF attachment) and hand it to SendRawEmailCommand. This is
 * the standard modern pattern for "SES + attachments" with the AWS SDK v3.
 *
 * Same "works today once configured, fails clearly until then" rule as
 * GOOGLE_DRIVE_* / GEMINI_API_KEY elsewhere in this app: if AWS_REGION /
 * AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / SES_FROM_EMAIL aren't all set
 * in .env, sendMail() logs a clear one-line warning and resolves without
 * sending, instead of throwing. Emails are always a side effect of a real
 * action that already succeeded (an application was shortlisted, a task was
 * approved, a certificate was issued) — a missing/misconfigured mail setup
 * should never roll back or block that real action, so every call site in
 * notifyVolunteer.js fires this and deliberately ignores the outcome.
 *
 * SES_FROM_EMAIL must be a verified sender identity in your SES account
 * (Simple Email Service console -> Verified identities) — SES rejects any
 * send whose From address isn't verified (or whose domain isn't, if the
 * whole domain was verified instead of one address). If the AWS account is
 * still in the SES sandbox, every recipient address must ALSO be verified
 * until you request production access — see the SES console's "Account
 * dashboard" for that request.
 */

function isConfigured() {
  return Boolean(
    process.env.AWS_REGION &&
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.SES_FROM_EMAIL
  );
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;

  const sesClient = new SESClient({
    region: process.env.AWS_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
  });

  // IMPORTANT: nodemailer's SES transport (checked against the actually
  // installed version — see node_modules/nodemailer/lib/ses-transport/index.js)
  // expects the AWS SDK v3 client under the key `ses` and the module that
  // exports SendRawEmailCommand under the key `aws` — i.e. exactly
  // `{ ses: sesClient, aws: require('@aws-sdk/client-ses') }`. An earlier
  // version of this file used `{ sesClient, SendRawEmailCommand }` instead,
  // which nodemailer doesn't recognize as the v3 shape at all — it silently
  // fell back to the old (pre-v3) `ses.sendRawEmail(...).promise()` call
  // path, which doesn't exist on a v3 SESClient, throwing
  // "ses.sendRawEmail is not a function" the moment a real send was
  // attempted. Worse, that throw happens synchronously inside a raw
  // Node.js stream 'end' event handler deep inside nodemailer, outside any
  // promise chain — so it couldn't be caught by this file's own try/catch
  // in sendMail() below, and crashed the entire Node process instead of
  // just failing one email send. Get this exact shape wrong again and the
  // whole app goes down, not just outgoing mail.
  transporter = nodemailer.createTransport({
    SES: { ses: sesClient, aws: awsSes },
  });

  return transporter;
}

// sendMail({ to, subject, html, text, attachments? })
// attachments (optional): [{ filename, content: Buffer, contentType }], same
// shape nodemailer already expects — passed straight through.
// Never throws: a failed/unconfigured send is logged and swallowed, per the
// file header comment above.
async function sendMail({ to, subject, html, text, attachments }) {
  if (!isConfigured()) {
    console.warn(
      `[mailer] Skipped "${subject}" to ${to} — AWS SES isn't configured yet ` +
        '(set AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SES_FROM_EMAIL in .env).'
    );
    return { sent: false, reason: 'not_configured' };
  }

  try {
    await getTransporter().sendMail({
      from: process.env.SES_FROM_EMAIL,
      to,
      subject,
      html,
      text,
      attachments,
    });
    return { sent: true };
  } catch (err) {
    console.error(`[mailer] Failed to send "${subject}" to ${to}:`, err.message);
    return { sent: false, reason: 'send_failed', error: err.message };
  }
}

module.exports = { sendMail, isConfigured };
