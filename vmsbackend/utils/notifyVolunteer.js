const { sendMail } = require('./mailer');
const {
  shortlistedEmail,
  taskAssignedEmail,
  revisionNeededEmail,
  trackBCompletedEmail,
  trackACompletedEmail,
} = require('./emailTemplates');
const { buildCertificateData } = require('./certificateData');
const { generateCertificatePdfBuffer } = require('./certificatePdf');

/**
 * The 5 volunteer email triggers this app sends via Amazon SES (see
 * utils/mailer.js for the actual SES/nodemailer wiring, utils/emailTemplates.js
 * for the copy). One function per trigger, called from exactly one hook
 * point each:
 *   - notifyShortlisted     <- adminApplicationController.updateStatus, when
 *                               a Track B application is moved to 'shortlisted'.
 *   - notifyTaskAssigned    <- adminTaskController.createTask, right after a
 *                               Task is created.
 *   - notifyRevisionNeeded  <- adminTaskController.updateTaskStatus, the
 *                               'revision' + feedback branch.
 *   - notifyTrackBCompleted <- adminTaskController.updateTaskStatus, the
 *                               'completed' branch (attaches the certificate).
 *   - notifyTrackACompleted <- volunteerApplicationController.submitTrackA,
 *                               right after the instant auto-approval
 *                               (attaches the certificate).
 *
 * Every function here is deliberately fire-and-forget from its caller's
 * point of view: it never throws. A real status change / task assignment /
 * certificate issuance has already happened and already been saved to the
 * database by the time any of these run — email delivery is a notification
 * about that fact, not a precondition for it, so a mail failure (bad SES
 * credentials, SES sandbox rejecting an unverified recipient, a network
 * blip) is logged (see mailer.js) and never allowed to turn into a 500 on
 * an otherwise-successful admin/volunteer action.
 */

function volunteerFullName(volunteer) {
  return `${volunteer.firstName} ${volunteer.lastName}`.trim() || 'Volunteer';
}

async function notifyShortlisted(volunteer, opportunity) {
  try {
    const { subject, html, text } = shortlistedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyShortlisted failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyTaskAssigned(volunteer, opportunity, task) {
  try {
    const { subject, html, text } = taskAssignedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
      taskTitle: task.title,
      description: task.description,
      dueDate: task.dueDate,
      reportingPerson: task.reportingPerson,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTaskAssigned failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyRevisionNeeded(volunteer, opportunity, task, feedback) {
  try {
    const { subject, html, text } = revisionNeededEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
      taskTitle: task.title,
      feedback,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyRevisionNeeded failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

// application must already have certificateIssued: true / certificateIssuedAt
// set (and saved) by the caller — see file header comment.
async function notifyTrackBCompleted(volunteer, opportunity, application) {
  try {
    const cert = await buildCertificateData(application, opportunity, volunteer);
    const pdfBuffer = await generateCertificatePdfBuffer(cert);
    const { subject, html, text } = trackBCompletedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
      certificateId: cert.certificateId,
    });
    return await sendMail({
      to: volunteer.email,
      subject,
      html,
      text,
      attachments: [{ filename: `${cert.certificateId}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTrackBCompleted failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

// Same contract as notifyTrackBCompleted — application must already have
// certificateIssued: true / certificateIssuedAt set and saved.
async function notifyTrackACompleted(volunteer, opportunity, application) {
  try {
    const cert = await buildCertificateData(application, opportunity, volunteer);
    const pdfBuffer = await generateCertificatePdfBuffer(cert);
    const { subject, html, text } = trackACompletedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
      certificateId: cert.certificateId,
    });
    return await sendMail({
      to: volunteer.email,
      subject,
      html,
      text,
      attachments: [{ filename: `${cert.certificateId}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTrackACompleted failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

module.exports = {
  notifyShortlisted,
  notifyTaskAssigned,
  notifyRevisionNeeded,
  notifyTrackBCompleted,
  notifyTrackACompleted,
};
