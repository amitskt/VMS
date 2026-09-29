const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');

const adminCertificateController = require('../controllers/adminCertificateController');

// Same broader gate as applicationsAdminRoutes.js / tasksAdminRoutes.js —
// visible to Super Admin and Department Heads, with department scoping
// handled inside the controller itself.
router.use(protect, requireRole('admin', 'manager'));

// NOTE: /meta before /:id-style routes, same lesson as everywhere else in
// this codebase.
router.get('/certificates/meta', adminCertificateController.getMeta);
router.get('/certificates', adminCertificateController.listCertificates);
router.get('/certificates/:id/pdf', adminCertificateController.downloadCertificatePdf);

module.exports = router;
