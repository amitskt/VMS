const mongoose = require('mongoose');

const certificateSettingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'certificate_settings' },
    signatoryName: { type: String, required: true, trim: true },
    signatoryDesignation: { type: String, required: true, trim: true },
    // Legacy single-template field — kept for backward compatibility with
    // any code path that hasn't been migrated to the CertificateTemplate
    // gallery yet, but no longer the source of truth for what a NEW
    // certificate renders with. See activeTemplateId below.
    certificateTemplate: { type: String, default: null },
    // Which CertificateTemplate a newly-issued certificate uses. Set at
    // seed time to the template built from whatever certificateTemplate
    // above already held (see scripts/seedCertificateTemplates.js), and
    // changeable afterward from the admin Settings page's template
    // gallery. Switching this NEVER changes how an already-issued
    // certificate looks — see Application.certificateTemplateId, which
    // freezes the template a specific certificate was issued with.
    activeTemplateId: { type: mongoose.Schema.Types.ObjectId, ref: 'CertificateTemplate', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Manager', default: null },
  },
  { timestamps: true, _id: false }
);

module.exports = mongoose.model('CertificateSettings', certificateSettingsSchema);
