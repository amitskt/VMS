
const CertificateSettings = require('../models/CertificateSettings');

const SETTINGS_ID = 'certificate_settings';

// GET /api/admin/settings/certificate
exports.getCertificateSettings = async (req, res, next) => {
  try {
    let settings = await CertificateSettings.findById(SETTINGS_ID);
    if (!settings) {
      // First-time default so the frontend always has something to render
      settings = await CertificateSettings.create({
        _id: SETTINGS_ID,
        signatoryName: 'Apurva Bhandari',
        signatoryDesignation: 'Founder, ST Planet Foundation',
      });
    }
    res.json(settings);
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/settings/certificate
// body: { signatoryName, signatoryDesignation, certificateTemplate? }
// certificateTemplate is a base64 data URL (JPG/PNG) of the admin-uploaded
// certificate design, or null to clear it and fall back to the built-in
// drawn design — see CertificateSettings.js and utils/certificatePdf.js.
exports.updateCertificateSettings = async (req, res, next) => {
  try {
    const { signatoryName, signatoryDesignation, certificateTemplate } = req.body;

    if (!signatoryName?.trim() || !signatoryDesignation?.trim()) {
      return res.status(400).json({ message: 'Signatory name and designation are required.' });
    }
    if (
      certificateTemplate !== undefined &&
      certificateTemplate !== null &&
      !/^data:image\/(png|jpe?g);base64,/.test(certificateTemplate)
    ) {
      return res.status(400).json({ message: 'Certificate template must be a JPG or PNG image.' });
    }

    const settings = await CertificateSettings.findByIdAndUpdate(
      SETTINGS_ID,
      {
        signatoryName: signatoryName.trim(),
        signatoryDesignation: signatoryDesignation.trim(),
        ...(certificateTemplate !== undefined && { certificateTemplate }),
        updatedBy: req.user.id,
      },
      { new: true, upsert: true }
    );
    
    res.json({ message: 'Certificate settings updated.', settings });
  } catch (err) {
    next(err);
  }
};
