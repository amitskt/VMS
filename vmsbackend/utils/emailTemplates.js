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

function applicationReceivedEmail({ volunteerName, opportunityTitle }) {
  const subject = 'Your Volunteer Application Has Been Received | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Thank you for applying for <strong>${opportunityTitle}</strong>. Your volunteer application has been successfully received and is now awaiting review by the concerned team.</p>
    <p>You can track your application status anytime from your dashboard's <strong>My Applications</strong> page. We'll keep you updated as your application progresses.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nThank you for applying for ${opportunityTitle}. Your volunteer application has been successfully received and is now awaiting review by the concerned team.\n\nYou can track your application status anytime from your dashboard's My Applications page. We'll keep you updated as your application progresses.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function shortlistedEmail({ volunteerName, opportunityTitle }) {
  const subject = 'Your Volunteer Application Has Been Shortlisted | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Good news — you've been <strong>shortlisted</strong> for <strong>${opportunityTitle}</strong>.</p>
    <p>The concerned team will reach out to you with the next steps, and a task will be assigned to you once you are selected. You can track your application status anytime from your dashboard's <strong>My Applications</strong> page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nGood news — you've been shortlisted for ${opportunityTitle}.\n\nThe concerned team will reach out to you with the next steps, and a task will be assigned to you once you are selected. You can track your application status anytime from your dashboard's My Applications page.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function taskAssignedEmail({ volunteerName, opportunityTitle, taskTitle, dueDate }) {
  const subject = 'A New Task Has Been Assigned to You | Track B STart';
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>A new task has been assigned to you for <strong>${opportunityTitle}</strong>. Your task is <strong>${taskTitle}</strong>, and it is due by <strong>${dueDateStr}</strong>.</p>
    <p>Please review the task details and complete your submission through STart. You can find the task and all relevant details in your dashboard's <strong>My Tasks</strong> page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nA new task has been assigned to you for ${opportunityTitle}. Your task is ${taskTitle}, and it is due by ${dueDateStr}.\n\nPlease review the task details and complete your submission through STart. You can find the task and all relevant details in your dashboard's My Tasks page.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function taskInProgressEmail({ volunteerName, opportunityTitle, taskTitle, dueDate }) {
  const subject = 'Your Assigned Task Is Now In Progress | Track B STart';
  const dueDateStr = dueDate ? new Date(dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Your task, <strong>${taskTitle}</strong>, for <strong>${opportunityTitle}</strong> is now marked as <strong>In Progress</strong>.</p>
    <p>Please continue working on the task and submit your completed work by <strong>${dueDateStr}</strong>. You can view the task details and track its status from your dashboard's <strong>My Tasks</strong> page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour task, ${taskTitle}, for ${opportunityTitle} is now marked as In Progress.\n\nPlease continue working on the task and submit your completed work by ${dueDateStr}. You can view the task details and track its status from your dashboard's My Tasks page.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function taskSubmittedEmail({ volunteerName, taskTitle }) {
  const subject = 'Your Task Submission Has Been Received | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Your submission for <strong>${taskTitle}</strong> has been successfully received by the concerned team.</p>
    <p>Your work will now be reviewed. You can track your task status anytime from your dashboard's <strong>My Tasks</strong> page, and we'll notify you once there is an update.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour submission for ${taskTitle} has been successfully received by the concerned team.\n\nYour work will now be reviewed. You can track your task status anytime from your dashboard's My Tasks page, and we'll notify you once there is an update.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function taskRevisedSubmissionEmail({ volunteerName, taskTitle }) {
  const subject = 'Your Revised Task Submission Has Been Received | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Your revised submission for <strong>${taskTitle}</strong> has been successfully received.</p>
    <p>The concerned team will review your updated work and share the next update with you. You can track your task status anytime from your dashboard's <strong>My Tasks</strong> page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour revised submission for ${taskTitle} has been successfully received.\n\nThe concerned team will review your updated work and share the next update with you. You can track your task status anytime from your dashboard's My Tasks page.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function revisionNeededEmail({ volunteerName, taskTitle, feedback }) {
  const subject = 'Revision Required for Your Task | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Your submission for <strong>${taskTitle}</strong> has been reviewed, and a revision is required before it can be approved.</p>
    <p><strong>Feedback:</strong> ${feedback}</p>
    <p>Please review the feedback and resubmit your work through STart. You can find the task and submission details in your dashboard's <strong>My Tasks</strong> page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour submission for ${taskTitle} has been reviewed, and a revision is required before it can be approved.\n\nFeedback: ${feedback}\n\nPlease review the feedback and resubmit your work through STart. You can find the task and submission details in your dashboard's My Tasks page.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function applicationNotSelectedEmail({ volunteerName, opportunityTitle }) {
  const subject = 'Update on Your Volunteer Application | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Thank you for your interest in <strong>${opportunityTitle}</strong> and for taking the time to apply. After reviewing your application, the concerned team has decided not to proceed with it for this opportunity.</p>
    <p>We appreciate your interest in volunteering with SankalpTaru and encourage you to explore other opportunities available on STart.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nThank you for your interest in ${opportunityTitle} and for taking the time to apply. After reviewing your application, the concerned team has decided not to proceed with it for this opportunity.\n\nWe appreciate your interest in volunteering with SankalpTaru and encourage you to explore other opportunities available on STart.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function applicationWithdrawnEmail({ volunteerName, opportunityTitle }) {
  const subject = 'Your Volunteer Application Has Been Withdrawn | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Your application for <strong>${opportunityTitle}</strong> has been successfully withdrawn.</p>
    <p>If you would like to participate in another volunteering opportunity, you can explore the available opportunities on STart.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nYour application for ${opportunityTitle} has been successfully withdrawn.\n\nIf you would like to participate in another volunteering opportunity, you can explore the available opportunities on STart.\n\n— The SankalpTaru Team`;
  return { subject, html, text };
}

function trackBCompletedEmail({ volunteerName, opportunityTitle, taskTitle }) {
  const subject = 'Your Task Has Been Successfully Completed | Track B STart';
  const html = FRAME(`
    <p>Hi ${volunteerName},</p>
    <p>Congratulations — your Track B task, <strong>${taskTitle}</strong>, for <strong>${opportunityTitle}</strong> has been successfully completed and approved by the concerned team.</p>
    <p>Your completion has been recorded in STart, and your certificate has been generated. You can access it from your dashboard's <strong>My Certificates</strong> page.</p>
    <p>— The SankalpTaru Team</p>
  `);
  const text = `Hi ${volunteerName},\n\nCongratulations — your Track B task, ${taskTitle}, for ${opportunityTitle} has been successfully completed and approved by the concerned team.\n\nYour completion has been recorded in STart, and your certificate has been generated. You can access it from your dashboard's My Certificates page.\n\n— The SankalpTaru Team`;
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
  applicationReceivedEmail,
  shortlistedEmail,
  taskAssignedEmail,
  taskInProgressEmail,
  taskSubmittedEmail,
  taskRevisedSubmissionEmail,
  revisionNeededEmail,
  applicationNotSelectedEmail,
  applicationWithdrawnEmail,
  trackBCompletedEmail,
  trackACompletedEmail,
  forgotPasswordOtpEmail,
  emailVerificationOtpEmail,
};
