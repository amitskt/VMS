const { sendMail } = require('./mailer');
const {
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
} = require('./emailTemplates');
const { buildCertificateData } = require('./certificateData');
const { generateCertificatePdfBuffer } = require('./certificatePdf');

/**
 * The volunteer email triggers this app sends via Amazon SES (see
 * utils/mailer.js for the actual SES/nodemailer wiring, utils/emailTemplates.js
 * for the copy). One function per trigger, called from exactly one hook
 * point each. Track B's full lifecycle (see models/Application.js's
 * TRACK_B_STATUSES and models/Task.js's TASK_STATUSES):
 *   - notifyApplicationReceived   <- volunteerApplicationController.createApplication,
 *                                     right after a Track B application is created
 *                                     (status starts at 'under_review' — there's no
 *                                     separate "received" status, so this single email
 *                                     covers both moments).
 *   - notifyShortlisted           <- adminApplicationController.updateStatus, when
 *                                     a Track B application is moved to 'shortlisted'.
 *   - notifyTaskAssigned          <- adminTaskController.createTask, right after a
 *                                     Task is created.
 *   - notifyTaskInProgress        <- adminTaskController.updateTaskStatus, the
 *                                     'inprogress' branch (Task Board drag-and-drop).
 *   - notifyTaskSubmitted         <- volunteerTaskController.submitTask, when the
 *                                     task's prior status was NOT 'revision'.
 *   - notifyTaskRevisedSubmission <- volunteerTaskController.submitTask, when the
 *                                     task's prior status WAS 'revision'.
 *   - notifyRevisionNeeded        <- adminTaskController.updateTaskStatus, the
 *                                     'revision' branch.
 *   - notifyApplicationNotSelected<- adminApplicationController.updateStatus, when
 *                                     a Track B application is moved to 'not_selected'.
 *   - notifyApplicationWithdrawn  <- volunteerApplicationController.withdrawApplication,
 *                                     Track B applications only.
 *   - notifyTrackBCompleted       <- adminTaskController.updateTaskStatus, the
 *                                     'completed' branch (attaches the certificate).
 *   - notifyTrackACompleted       <- volunteerApplicationController.submitTrackA,
 *                                     right after the instant auto-approval
 *                                     (attaches the certificate).
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

async function notifyApplicationReceived(volunteer, opportunity) {
  try {
    const { subject, html, text } = applicationReceivedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyApplicationReceived failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
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
      dueDate: task.dueDate,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTaskAssigned failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyTaskInProgress(volunteer, opportunity, task) {
  try {
    const { subject, html, text } = taskInProgressEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
      taskTitle: task.title,
      dueDate: task.dueDate,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTaskInProgress failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyTaskSubmitted(volunteer, opportunity, task) {
  try {
    const { subject, html, text } = taskSubmittedEmail({
      volunteerName: volunteerFullName(volunteer),
      taskTitle: task.title,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTaskSubmitted failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyTaskRevisedSubmission(volunteer, opportunity, task) {
  try {
    const { subject, html, text } = taskRevisedSubmissionEmail({
      volunteerName: volunteerFullName(volunteer),
      taskTitle: task.title,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyTaskRevisedSubmission failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyRevisionNeeded(volunteer, opportunity, task, feedback) {
  try {
    const { subject, html, text } = revisionNeededEmail({
      volunteerName: volunteerFullName(volunteer),
      taskTitle: task.title,
      feedback,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyRevisionNeeded failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyApplicationNotSelected(volunteer, opportunity) {
  try {
    const { subject, html, text } = applicationNotSelectedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyApplicationNotSelected failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

async function notifyApplicationWithdrawn(volunteer, opportunity) {
  try {
    const { subject, html, text } = applicationWithdrawnEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
    });
    return await sendMail({ to: volunteer.email, subject, html, text });
  } catch (err) {
    console.error('[notifyVolunteer] notifyApplicationWithdrawn failed:', err.message);
    return { sent: false, reason: 'error', error: err.message };
  }
}

// application must already have certificateIssued: true / certificateIssuedAt
// set (and saved) by the caller — see file header comment.
async function notifyTrackBCompleted(volunteer, opportunity, application, task) {
  try {
    const cert = await buildCertificateData(application, opportunity, volunteer);
    const pdfBuffer = await generateCertificatePdfBuffer(cert);
    const { subject, html, text } = trackBCompletedEmail({
      volunteerName: volunteerFullName(volunteer),
      opportunityTitle: opportunity.title,
      taskTitle: task.title,
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
  notifyApplicationReceived,
  notifyShortlisted,
  notifyTaskAssigned,
  notifyTaskInProgress,
  notifyTaskSubmitted,
  notifyTaskRevisedSubmission,
  notifyRevisionNeeded,
  notifyApplicationNotSelected,
  notifyApplicationWithdrawn,
  notifyTrackBCompleted,
  notifyTrackACompleted,
};
