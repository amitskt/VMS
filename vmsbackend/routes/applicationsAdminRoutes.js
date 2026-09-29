const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');

const adminApplicationController = require('../controllers/adminApplicationController');

// Same broader gate as opportunitiesAdminRoutes.js / volunteersAdminRoutes.js
// — visible to Super Admin and Department Heads, with the finer department
// scoping handled inside the controller itself.
router.use(protect, requireRole('admin', 'manager'));

// NOTE: /meta before /:id-style routes, same lesson as everywhere else in
// this codebase.
router.get('/applications/meta', adminApplicationController.getMeta);
router.get('/applications', adminApplicationController.listApplications);
router.get('/applications/:id', adminApplicationController.getApplication);
router.patch('/applications/:id/status', adminApplicationController.updateStatus);

module.exports = router;
