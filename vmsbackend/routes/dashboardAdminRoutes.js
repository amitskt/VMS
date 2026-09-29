const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');

const adminDashboardController = require('../controllers/adminDashboardController');

// Admin OR manager, same reasoning as volunteersAdminRoutes.js/
// opportunitiesAdminRoutes.js/etc — mounted before adminRoutes.js (Super
// Admin only) in server.js so a manager's request reaches this broader
// gate first.
router.use(protect, requireRole('admin', 'manager'));

router.get('/dashboard-summary', adminDashboardController.getDashboardSummary);
router.get('/me', adminDashboardController.getMyProfile);

module.exports = router;
