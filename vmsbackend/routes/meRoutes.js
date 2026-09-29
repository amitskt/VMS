const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// Any logged-in volunteer, manager, or admin.
router.get('/me', protect, (req, res) => {
  res.json({ id: req.user.id, role: req.user.role, email: req.user.email });
});

// Example of a manager/admin-only route.
router.get('/admin/ping', protect, requireRole('admin', 'manager'), (req, res) => {
  res.json({ message: `Hello ${req.user.role}, you're authorized.` });
});

module.exports = router;
