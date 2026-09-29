const Manager = require('../models/Manager');

/**
 * DELIBERATELY MISSING:
 * - resetPassword — Managers authenticate via Google OAuth (no password
 *   field on the schema at all), so there's nothing to reset.
 * - reassignDepartment (as a standalone action) — removed from the
 *   Settings page's "Admin Access" table per request. Department changes
 *   now only happen through the Departments page's "Assign Department
 *   Head" flow (see departmentController.assignDepartmentHead).
 */

// GET /api/admin/managers  (Settings page "Admin Access" table, and the
// dropdown source for Departments page's assign modal)
exports.listManagers = async (req, res, next) => {
  try {
    const { department, status } = req.query;
    const filter = {};
    if (department) filter.department = department;
    if (status) filter.isActive = status === 'active';

    const managers = await Manager.find(filter).sort({ createdAt: -1 });
    res.json(managers);
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/managers   body: { name, email, department }
exports.createManager = async (req, res, next) => {
  try {
    const { name, email, department } = req.body;

    if (!name?.trim() || !email?.trim() || !department) {
      return res.status(400).json({ message: 'name, email, and department are all required.' });
    }
    if (!Manager.DEPARTMENTS.includes(department)) {
      return res.status(400).json({ message: `department must be one of: ${Manager.DEPARTMENTS.join(', ')}` });
    }

    const existing = await Manager.findOne({ email: email.trim().toLowerCase() });
    if (existing) {
      return res.status(409).json({ message: 'A manager with this email already exists.' });
    }

    const manager = await Manager.create({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      department,
      isActive: true,
    });

    res.status(201).json({
      message: `Account created for ${manager.email}. They can now sign in with Google.`,
      manager,
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

// PATCH /api/admin/managers/:id/toggle-status
exports.toggleManagerStatus = async (req, res, next) => {
  try {
    const manager = await Manager.findById(req.params.id);
    if (!manager) return res.status(404).json({ message: 'Manager not found.' });

    manager.isActive = !manager.isActive;
    await manager.save();

    res.json({
      message: `Account ${manager.isActive ? 'enabled' : 'disabled'} successfully.`,
      manager,
    });
  } catch (err) {
    next(err);
  }
};
