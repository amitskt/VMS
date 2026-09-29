const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');

const adminTaskController = require('../controllers/adminTaskController');

// Same broader gate as applicationsAdminRoutes.js / opportunitiesAdminRoutes.js
// — Super Admin and Department Heads, with department scoping handled
// inside the controller itself.
router.use(protect, requireRole('admin', 'manager'));

// NOTE: /meta and /assignable before /:id-style routes, same lesson as
// everywhere else in this codebase.
router.get('/tasks/meta', adminTaskController.getMeta);
router.get('/tasks/assignable', adminTaskController.listAssignable);
router.get('/tasks', adminTaskController.listTasks);
router.post('/tasks', adminTaskController.createTask);
router.patch('/tasks/:id/status', adminTaskController.updateTaskStatus);
router.post('/tasks/:id/comments', adminTaskController.addComment);

module.exports = router;
