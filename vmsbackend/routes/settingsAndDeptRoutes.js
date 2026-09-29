const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/auth');

const settingsController = require('../controllers/settingsController');
const certificateTemplateController = require('../controllers/certificateTemplateController');
const managerController = require('../controllers/managerController');
const departmentController = require('../controllers/departmentController');

// Everything below is Super Admin only, matching both the Settings page
// and the Departments page being gated to Super Admin in the frontend.
router.use(protect, requireRole('admin'));

/* ---- Certificate Settings ---- */
router.get('/settings/certificate', settingsController.getCertificateSettings);
router.put('/settings/certificate', settingsController.updateCertificateSettings);

/* ---- Certificate Template gallery (add new / choose active) ---- */
router.get('/settings/certificate-templates', certificateTemplateController.listTemplates);
router.post('/settings/certificate-templates', certificateTemplateController.createTemplate);
router.put('/settings/certificate-templates/:id/activate', certificateTemplateController.activateTemplate);
router.delete('/settings/certificate-templates/:id', certificateTemplateController.deleteTemplate);

/* ---- Department Head / Manager accounts ("Admin Access" table) ---- */
router.get('/managers', managerController.listManagers);
router.post('/managers', managerController.createManager);
router.patch('/managers/:id/toggle-status', managerController.toggleManagerStatus);
// Deliberately no /managers/:id/reset-password or /managers/:id/reassign —
// see managerController.js header comment for why.

/* ---- Departments overview (fixed list + per-department summary) ---- */
router.get('/departments', departmentController.getDepartmentsSummary);

module.exports = router;
