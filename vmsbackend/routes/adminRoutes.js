const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');

const settingsController = require('../controllers/settingsController');
const certificateTemplateController = require('../controllers/certificateTemplateController');
const managerController = require('../controllers/managerController');
const departmentController = require('../controllers/departmentController');
const activityLogController = require('../controllers/activityLogController');

// Everything in this file is Super Admin only.
router.use(protect, requireRole('admin'));

/* ---- Certificate Settings ---- */
router.get('/settings/certificate', settingsController.getCertificateSettings);
router.put('/settings/certificate', settingsController.updateCertificateSettings);

/* ---- Certificate Template gallery (add new / choose active) ---- */
router.get('/settings/certificate-templates', certificateTemplateController.listTemplates);
router.post('/settings/certificate-templates', certificateTemplateController.createTemplate);
router.put('/settings/certificate-templates/:id/activate', certificateTemplateController.activateTemplate);
router.delete('/settings/certificate-templates/:id', certificateTemplateController.deleteTemplate);

/* ---- Department Head / Manager accounts ---- */
router.get('/managers', managerController.listManagers);
router.post('/managers', managerController.createManager);
router.patch('/managers/:id/toggle-status', managerController.toggleManagerStatus);
// No /managers/:id/reset-password or /managers/:id/reassign — see
// managerController.js header comment for why both were left out.

/* ---- Departments (fixed list + summary + assign head) ---- */
router.get('/departments', departmentController.getDepartmentsSummary);
router.patch('/departments/:name/assign-head', departmentController.assignDepartmentHead);

/* ---- Activity Log ---- */
router.get('/activity-log', activityLogController.listActivityLog);

module.exports = router;
