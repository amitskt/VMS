const CertificateSettings = require('../models/CertificateSettings');
const CertificateTemplate = require('../models/CertificateTemplate');
const Application = require('../models/Application');
const { toPublicCertificate } = require('../views/certificateView');
const { uploadBufferForVolunteer } = require('./driveUpload');

const SETTINGS_ID = 'certificate_settings';

/**
 * Resolves which template image/layout/palette a SPECIFIC application's
 * certificate should render with, for utils/certificatePdf.js:
 *   - If the application already has certificateTemplateId (pinned at
 *     issuance time — see controllers/adminApplicationController.js,
 *     adminTaskController.js, volunteerApplicationController.js), that
 *     exact CertificateTemplate is used, regardless of whatever the admin
 *     has since changed the active template to. This is what keeps an
 *     already-issued certificate looking the same forever.
 *   - Otherwise (an application issued before this model existed, and not
 *     yet covered by scripts/migratePinCertificateTemplates.js) falls back
 *     to CertificateSettings.activeTemplateId, then to the legacy
 *     CertificateSettings.certificateTemplate field (always layoutA), then
 *     to nothing (utils/certificatePdf.js's built-in drawn design).
 */
async function resolveCertificateTemplate(application) {
  if (application?.certificateTemplateId) {
    const pinned = await CertificateTemplate.findById(application.certificateTemplateId);
    if (pinned) {
      return { templateImage: pinned.image, templateLayout: pinned.layout, templatePalette: pinned.palette };
    }
  }

  const settings = await CertificateSettings.findById(SETTINGS_ID);
  if (settings?.activeTemplateId) {
    const active = await CertificateTemplate.findById(settings.activeTemplateId);
    if (active) {
      return { templateImage: active.image, templateLayout: active.layout, templatePalette: active.palette };
    }
  }

  if (settings?.certificateTemplate) {
    return { templateImage: settings.certificateTemplate, templateLayout: 'layoutA', templatePalette: null };
  }

  return { templateImage: null, templateLayout: null, templatePalette: null };
}

/**
 * Builds the exact object streamCertificatePdf/generateCertificatePdfBuffer
 * expect (utils/certificatePdf.js) — the certificate-shaped view of an
 * Application (certificateView.toPublicCertificate) plus the admin-configured
 * signatory name/designation (CertificateSettings) and this application's
 * own resolved template (see resolveCertificateTemplate above). Used by
 * every place that needs a rendered certificate PDF: the volunteer/admin
 * "Download PDF" endpoints and the SES email-attachment triggers
 * (adminTaskController.js / volunteerApplicationController.js), so there's
 * exactly one place that assembles this object.
 *
 * Requires application.certificateIssued to already be true and opportunity/
 * volunteer to already be populated/loaded docs.
 */
async function buildCertificateData(application, opportunity, volunteer) {
  const cert = toPublicCertificate(application, opportunity, volunteer);
  const [settings, template] = await Promise.all([
    CertificateSettings.findById(SETTINGS_ID),
    resolveCertificateTemplate(application),
  ]);
  return {
    ...cert,
    signatoryName: settings?.signatoryName,
    signatoryDesignation: settings?.signatoryDesignation,
    ...template,
  };
}

/**
 * Pins the currently-active certificate template onto an application at the
 * moment it is issued (certificateIssued set to true) — called by every
 * issuance site (controllers/adminApplicationController.js,
 * adminTaskController.js, volunteerApplicationController.js) right
 * alongside setting certificateIssued/certificateIssuedAt. Does NOT save
 * the application — callers already do a single .save() right after
 * setting certificateIssued, so this just sets the field on the in-memory
 * document to be included in that same save.
 *
 * A no-op (leaves certificateTemplateId null) when no active template has
 * been configured yet — utils/certificateData.js's resolveCertificateTemplate
 * falls back to the legacy CertificateSettings.certificateTemplate / the
 * built-in drawn design in that case, same as before this model existed.
 */
async function pinActiveCertificateTemplate(application) {
  const settings = await CertificateSettings.findById(SETTINGS_ID);
  if (settings?.activeTemplateId) {
    application.certificateTemplateId = settings.activeTemplateId;
  }
}

/**
 * Generates this application'''s certificate PDF and uploads it into a
 * 'certificates' subfolder inside the volunteer'''s own Drive folder (see
 * utils/driveUpload.js'''s uploadBufferForVolunteer / getOrCreateVolunteerSubfolder),
 * then records the
 * resulting link on the Application (certificateDriveUrl/Key). Deliberately
 * fire-and-forget from every caller'''s point of view, same contract as
 * utils/notifyVolunteer.js'''s notify*Completed functions right next to
 * which this is always called: certificateIssued is already true and saved
 * by the time this runs, so a Drive hiccup here is logged and swallowed
 * rather than allowed to fail an already-successful issuance. Requires
 * volunteer.email (used as the per-volunteer Drive folder'''s name) and
 * opportunity/volunteer to already be populated/loaded docs, same as
 * buildCertificateData.
 */
async function uploadCertificateToDrive(application, opportunity, volunteer) {
  try {
    if (!volunteer?.email) return;
    // Required lazily (not at module top-level) solely to avoid a require
    // cycle: certificatePdf.js has no reason to import certificateData.js
    // today, but keeping this one lazy costs nothing and removes the risk
    // entirely if that ever changes.
    const { generateCertificatePdfBuffer } = require('./certificatePdf');

    const cert = await buildCertificateData(application, opportunity, volunteer);
    const pdfBuffer = await generateCertificatePdfBuffer(cert);
    const { url, key } = await uploadBufferForVolunteer(
      pdfBuffer,
      `${cert.certificateId}.pdf`,
      'application/pdf',
      'certificate',
      volunteer.email,
      'certificates'
    );
    await Application.findByIdAndUpdate(application._id, { certificateDriveUrl: url, certificateDriveKey: key });
  } catch (err) {
    console.error('[certificateData] uploadCertificateToDrive failed:', err.message);
  }
}

module.exports = { buildCertificateData, resolveCertificateTemplate, pinActiveCertificateTemplate, uploadCertificateToDrive };
