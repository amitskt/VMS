const CertificateTemplate = require('../models/CertificateTemplate');
const CertificateSettings = require('../models/CertificateSettings');
const Application = require('../models/Application');

const SETTINGS_ID = 'certificate_settings';

/**
 * The certificate template gallery (Settings page) — lets an admin add new
 * certificate designs and choose which one new certificates are issued
 * with, without ever touching how already-issued certificates look (see
 * Application.certificateTemplateId, set once at issuance and never
 * changed afterward — utils/certificateData.js resolves each certificate's
 * OWN pinned template, not whatever is active "now"). Replaces the old
 * single-upload flow (settingsController.js's certificateTemplate field,
 * still kept for backward compatibility but no longer the source of truth
 * for new issuances — see CertificateSettings.activeTemplateId).
 */

// GET /api/admin/settings/certificate-templates
exports.listTemplates = async (req, res, next) => {
  try {
    const [templates, settings] = await Promise.all([
      CertificateTemplate.find().sort({ createdAt: 1 }),
      CertificateSettings.findById(SETTINGS_ID),
    ]);
    res.json({
      templates,
      activeTemplateId: settings?.activeTemplateId || null,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/settings/certificate-templates
// body: { name, image (base64 data URL), layout ('layoutA'|'layoutB'), palette? ('light'|'dark') }
// A newly-uploaded template always uses layoutB (the current shared
// coordinate set) unless the admin is re-uploading a differently-designed
// layoutA-style image — layoutA's coordinates were hand-measured against
// one specific reference image, so a new arbitrary upload almost certainly
// doesn't match it. Defaults to layoutB/light when not specified, since
// that's the safer guess for an unknown new design (dark text still reads
// on most light-to-mid backgrounds; the reverse is not true).
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, image, layout, palette } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ message: 'Template name is required.' });
    }
    if (!image || !/^data:image\/(png|jpe?g);base64,/.test(image)) {
      return res.status(400).json({ message: 'Template image must be a JPG or PNG image.' });
    }
    const resolvedLayout = layout === 'layoutA' ? 'layoutA' : 'layoutB';
    const resolvedPalette = resolvedLayout === 'layoutB' ? (palette === 'dark' ? 'dark' : 'light') : null;

    const existing = await CertificateTemplate.findOne({ name: name.trim() });
    if (existing) {
      return res.status(400).json({ message: 'A template with this name already exists.' });
    }

    const template = await CertificateTemplate.create({
      name: name.trim(),
      image,
      layout: resolvedLayout,
      palette: resolvedPalette,
      isDefault: false,
      createdBy: req.user.id,
    });

    res.status(201).json({ message: 'Template added.', template });
  } catch (err) {
    next(err);
  }
};

// PUT /api/admin/settings/certificate-templates/:id/activate
// Sets this template as the one new certificates are issued with. Does not
// touch any already-issued certificate — see Application.certificateTemplateId.
exports.activateTemplate = async (req, res, next) => {
  try {
    const template = await CertificateTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found.' });
    }

    const settings = await CertificateSettings.findByIdAndUpdate(
      SETTINGS_ID,
      { activeTemplateId: template._id, updatedBy: req.user.id },
      { new: true, upsert: true }
    );

    res.json({ message: `"${template.name}" is now the active template.`, activeTemplateId: settings.activeTemplateId });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/admin/settings/certificate-templates/:id
// Blocked for the default/seeded template, the currently-active template,
// and any template at least one already-issued certificate is pinned to —
// deleting any of those would either break the "new certificate" flow
// (active) or make an already-issued certificate unrenderable on its next
// download/re-send (pinned). An admin who wants to stop using a template
// can simply activate a different one instead; the old one just stops
// appearing as a pick for NEW certificates but stays available so its
// history keeps working.
exports.deleteTemplate = async (req, res, next) => {
  try {
    const template = await CertificateTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: 'Template not found.' });
    }
    if (template.isDefault) {
      return res.status(400).json({ message: 'The default template cannot be deleted.' });
    }

    const settings = await CertificateSettings.findById(SETTINGS_ID);
    if (settings?.activeTemplateId && String(settings.activeTemplateId) === String(template._id)) {
      return res.status(400).json({ message: 'This is the active template — activate a different one first.' });
    }

    const pinnedCount = await Application.countDocuments({ certificateTemplateId: template._id });
    if (pinnedCount > 0) {
      return res.status(400).json({
        message: `${pinnedCount} already-issued certificate(s) use this template and would break — it can't be deleted.`,
      });
    }

    await template.deleteOne();
    res.json({ message: 'Template deleted.' });
  } catch (err) {
    next(err);
  }
};
