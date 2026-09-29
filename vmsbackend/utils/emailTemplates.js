/**
 * The actual copy for every transactional email this app sends (see
 * utils/notifyVolunteer.js for where each one fires, utils/mailer.js for
 * how it's actually sent). Plain inline-styled HTML + a plain-text
 * fallback for every template — email clients don't reliably load external
 * stylesheets, so styling stays inline, matching the app's own forest/gold
 * palette (utils/certificatePdf.js's COLOR constants) so an email looks like
 * it came from the same product as the certificate/app it references.
 *
 * Every template takes only real data already on hand at its call site
 * (volunteer name, opportunity title, task fields, certificate id) — no
 * invented stats or filler copy, same anti-fabrication rule the rest of
 * this codebase already follows (see e.g. controllers/publicController.js's
 * header comment).
 */

const FRAME = (bodyHtml) => `
<div style="background:#F5F1E8;padding:32px 16px;font-family:Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e0d3;">
    <div style="background:#1F6B52;padding:20px 28px;">
      <span style="color:#F5F1E8;font-size:18px;font-weight:700;">STart</span>
    </div>
    <div style="padding:28px;color:#16423C;font-size:15px;line-height:1.6;">
      ${bodyHtml}
    </div>
    <div style="padding:16px 28px;background:#F5F1E8;color:#6b7280;font-size:12px;">
      This is an automated message from SankalpTaru VMS.
    </div>
  </div>
</div>`;

function shortlistedEmail({ volunteerName, opportunityTitle }) {
  const subject = 'Your Volunteer Application Has Been Shortlisted | SankalpTaru VMS';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Good news — you've been <strong>shortlisted</strong> for <strong>${opportunityTitle}</strong>.</p>
    <p>The coordinator may reach out to you shortly, and a task will be assigned to you soon. You can track your application status anytime from your dashboard's My Applications page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYou've been shortlisted for ${opportunityTitle}. The coordinator may reach out to you shortly, and a task will be assigned to you soon.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function taskAssignedEmail({ volunteerName, opportunityTitle, taskTitle, description, dueDate, reportingPerson }) {
  const subject = 'New Volunteer Task Assigned | SankalpTaru VMS';
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>A task has been assigned to you for <strong>${opportunityTitle}</strong>:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0;">
      <tr><td style="padding:6px 0;color:#6b7280;">Task</td><td style="padding:6px 0;"><strong>${taskTitle}</strong></td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Description</td><td style="padding:6px 0;">${description}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Due date</td><td style="padding:6px 0;">${dueDateStr}</td></tr>
      <tr><td style="padding:6px 0;color:#6b7280;">Reporting to</td><td style="padding:6px 0;">${reportingPerson}</td></tr>
    </table>
    <p>Log in to My Tasks to view the full details and submit your work once it's ready.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nA task has been assigned to you for ${opportunityTitle}:\nTask: ${taskTitle}\nDescription: ${description}\nDue date: ${dueDateStr}\nReporting to: ${reportingPerson}\n\nLog in to My Tasks to view the full details and submit your work once it's ready.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function revisionNeededEmail({ volunteerName, opportunityTitle, taskTitle, feedback }) {
  const subject = 'Your Volunteer Task Has Been Updated | SankalpTaru VMS';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Your submission for <strong>${taskTitle}</strong> (${opportunityTitle}) needs a small revision before it can be approved:</p>
    <div style="background:#F5F1E8;border-left:3px solid #D8B75C;padding:12px 16px;margin:16px 0;border-radius:6px;">${feedback}</div>
    <p>Please make the requested changes and resubmit from My Tasks.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour submission for ${taskTitle} (${opportunityTitle}) needs a small revision before it can be approved:\n\n"${feedback}"\n\nPlease make the requested changes and resubmit from My Tasks.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function trackBCompletedEmail({ volunteerName, opportunityTitle, certificateId }) {
  const subject = 'Volunteer Task Completed | SankalpTaru VMS';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>🎉 Your work on <strong>${opportunityTitle}</strong> has been reviewed and approved. Thank you for your contribution!</p>
    <p>Your certificate of completion (ID: <strong>${certificateId}</strong>) is attached to this email, and is also available anytime from My Certificates.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour work on ${opportunityTitle} has been reviewed and approved. Thank you for your contribution!\n\nYour certificate of completion (ID: ${certificateId}) is attached to this email, and is also available anytime from My Certificates.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function trackACompletedEmail({ volunteerName, opportunityTitle, certificateId }) {
  const subject = 'Update on Your Volunteer Task | SankalpTaru VMS';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>🎉 Thank you for completing <strong>${opportunityTitle}</strong>! Your submission has been received and your certificate of completion has been issued automatically.</p>
    <p>Your certificate (ID: <strong>${certificateId}</strong>) is attached to this email, and is also available anytime from My Certificates.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nThank you for completing ${opportunityTitle}! Your submission has been received and your certificate of completion has been issued automatically.\n\nYour certificate (ID: ${certificateId}) is attached to this email, and is also available anytime from My Certificates.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function forgotPasswordOtpEmail({ volunteerName, otp }) {
  const subject = 'Your Volunteer Account Password Reset Code | SankalpTaru VMS';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Use the verification code below to reset your SankalpTaru Volunteer account password. This code is valid for <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;background:#F5F1E8;border:1px solid #D8B75C;border-radius:8px;padding:14px 28px;font-size:28px;font-weight:800;letter-spacing:6px;color:#1F6B52;">${otp}</span>
    </div>
    <p>If you didn't request this, you can safely ignore this email — your password won't be changed.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nUse this verification code to reset your SankalpTaru Volunteer account password: ${otp}\n\nThis code is valid for 10 minutes. If you didn't request this, you can safely ignore this email — your password won't be changed.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function emailVerificationOtpEmail({ volunteerName, otp }) {
  const subject = 'Verify Your Email to Complete Registration | SankalpTaru VMS';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Use the verification code below to confirm your email address and activate your SankalpTaru Volunteer account. This code is valid for <strong>10 minutes</strong>.</p>
    <div style="text-align:center;margin:24px 0;">
      <span style="display:inline-block;background:#F5F1E8;border:1px solid #D8B75C;border-radius:8px;padding:14px 28px;font-size:28px;font-weight:800;letter-spacing:6px;color:#1F6B52;">${otp}</span>
    </div>
    <p>If you didn't create this account, you can safely ignore this email.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nUse this verification code to confirm your email address and activate your SankalpTaru Volunteer account: ${otp}\n\nThis code is valid for 10 minutes. If you didn't create this account, you can safely ignore this email.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

module.exports = {
  shortlistedEmail,
  taskAssignedEmail,
  revisionNeededEmail,
  trackBCompletedEmail,
  trackACompletedEmail,
  forgotPasswordOtpEmail,
  emailVerificationOtpEmail,
};
