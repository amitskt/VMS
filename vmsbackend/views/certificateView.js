// Converted from 15-my-certificates.html (volunteer) + admin-10-certificates.html
// (Super Admin + Department Heads). There is no separate Certificate model —
// a "certificate" is just an Application that has certificateIssued: true
// (set the moment Track A's submitTrackA finalizes, or the moment a Track B
// Task's contribution hours are approved — see adminTaskController.js's
// updateTaskStatus 'completed' branch). This view module is what turns that
// same Application document into the certificate-shaped object both the
// admin log and the volunteer's own list actually render.
//
// certificateIdFor() is a cosmetic display code, same pattern as
// applicationView.js's own `referenceId` (its comment explains why: "derived
// from the real _id and creation year, not a separately stored field").
// Lookups (view/PDF download) always use the real Application _id as the
// route param, never this derived string — exactly like every other
// admin/volunteer controller in this codebase already does with :id.
function certificateIdFor(application) {
  const year = new Date(application.certificateIssuedAt || application.createdAt).getFullYear();
  return `ST-CERT-${year}-${String(application._id).slice(-8).toUpperCase()}`;
}

function toPublicCertificate(application, opportunityDoc, volunteerDoc) {
  return {
    applicationId: application._id,
    certificateId: certificateIdFor(application),
    track: application.track,
    type: application.track === 'a' ? 'Track A Completion' : 'Track B Completion',
    opportunityTitle: opportunityDoc ? opportunityDoc.title : '',
    department: opportunityDoc ? (opportunityDoc.depts || [])[0] || '—' : '—',
    volunteerName: volunteerDoc
      ? `${volunteerDoc.firstName} ${volunteerDoc.lastName}`.trim() || '(no name on file)'
      : '',
    issuedAt: application.certificateIssuedAt,
    // The certificate PDF's own public Drive link ("anyone with the link
    // can view" — see utils/driveUpload.js's makeViewableByAnyone, set at
    // issuance time by utils/certificateData.js's uploadCertificateToDrive).
    // Exposed here so the frontend's "Share on LinkedIn" button (see
    // Certificates.jsx) can share the actual certificate instead of just
    // the org's homepage. Can be null for a certificate issued before this
    // field existed, or if the best-effort Drive upload failed — callers
    // must handle that and fall back to something reasonable.
    certificateDriveUrl: application.certificateDriveUrl || null,
  };
}

module.exports = { certificateIdFor, toPublicCertificate };
