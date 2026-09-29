const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');

const volunteerAdminController = require('../controllers/volunteerAdminController');

// Unlike adminRoutes.js (Super Admin only), the Volunteers directory is
// visible to both Super Admin and Department Heads — so this gets its own
// router with a broader role gate rather than living inside adminRoutes.js.
// Mounted at the same '/api/admin' prefix in server.js, BEFORE adminRoutes,
// so a manager's request reaches this gate first; anything that doesn't
// match a route here (e.g. /api/admin/managers) falls through to
// adminRoutes.js's stricter admin-only gate as normal.
router.use(protect, requireRole('admin', 'manager'));

router.get('/volunteers', volunteerAdminController.listVolunteers);
router.get('/volunteers/districts', volunteerAdminController.listVolunteerDistricts);
router.get('/volunteers/groups', volunteerAdminController.listVolunteerGroups);
router.get('/volunteers/:id/engagement', volunteerAdminController.getVolunteerEngagement);

module.exports = router;