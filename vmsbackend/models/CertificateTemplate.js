const mongoose = require('mongoose');

/**
 * A single certificate design an admin can choose to issue new certificates
 * with. Introduced alongside the original single-template Settings-page
 * upload (CertificateSettings.certificateTemplate) to support a gallery of
 * templates instead of just one — see CertificateSettings.activeTemplateId
 * (which one new certificates use) and Application.certificateTemplateId
 * (which one a SPECIFIC already-issued certificate was actually rendered
 * with, frozen forever at issuance time so switching the active template
 * later never changes how an old certificate looks/re-downloads).
 *
 * `image`: base64 data URL of the background artwork, same storage pattern
 * as CertificateSettings.certificateTemplate (no S3/Cloudinary dependency).
 * Unlike the old single-field version, this image is expected to already
 * have any placeholder/sample text removed — utils/certificatePdf.js draws
 * it as a full-page background and overlays only the 4 dynamic fields
 * (name, issued date, certificate ID, verify line) on top, so any leftover
 * placeholder text in the image itself would show through behind the real
 * values.
 *
 * `layout` + `palette` select which hand-measured coordinate set in
 * utils/certificatePdf.js's LAYOUTS draws those 4 fields:
 *   - 'layoutA' (palette: null) — the original template design (the one
 *     CertificateSettings.certificateTemplate already held before this
 *     model existed). Single color scheme, no palette variants.
 *   - 'layoutB' (palette: 'light' | 'dark') — the newer template family
 *     (Cr01/Cr02/Cr03), one shared coordinate set with two color variants
 *     for light-background vs dark-background artwork.
 * A future differently-laid-out template would need a new layout key added
 * to LAYOUTS (and this enum) with its own hand-measured coordinates — see
 * that file's header comment.
 */
const certificateTemplateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    layout: { type: String, enum: ['layoutA', 'layoutB'], required: true, default: 'layoutA' },
    palette: { type: String, enum: ['light', 'dark', null], default: null },
    // The very first template (seeded from whatever CertificateSettings.certificateTemplate
    // already held, or the built-in drawn design if nothing had been
    // uploaded yet) — kept so the gallery UI can label it and avoid ever
    // being deleted out from under already-issued certificates that predate
    // this model and have no other template to point back to.
    isDefault: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager', default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CertificateTemplate', certificateTemplateSchema);
