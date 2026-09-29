const Manager = require('../models/Manager');
// const Opportunity = require('../models/Opportunity'); // wire up once this model exists
// const Application = require('../models/Application');   // wire up once this model exists

/**
 * Departments are FIXED (Manager.DEPARTMENTS) — there is no Department
 * collection to CRUD. This controller just summarizes, per department,
 * which manager currently heads it (their single `department` field) and
 * how many opportunities/applications belong to it.
 */

// GET /api/admin/departments
exports.getDepartmentsSummary = async (req, res, next) => {
  try {
    const managers = await Manager.find({ isActive: true }).select('name email department');

    const summary = await Promise.all(
      Manager.DEPARTMENTS.map(async (deptName) => {
        const heads = managers
          .filter((m) => m.department === deptName)
          .map((m) => ({ id: m._id, name: m.name, email: m.email }));

        // Placeholder counts — replace with real queries once Opportunity /
        // Application models exist, e.g.:
        // const opps = await Opportunity.countDocuments({ department: deptName, status: 'active' });
        // const apps = await Application.countDocuments({ department: deptName, status: { $in: ['applied','review','shortlisted'] } });
        const opportunitiesCount = 0;
        const openApplicationsCount = 0;

        return { name: deptName, heads, opportunitiesCount, openApplicationsCount };
      })
    );

    res.json(summary);
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/departments/:name/assign-head   body: { managerId }
//
// "Assigning a department head" just means setting that manager's single
// `department` field to this department — since one person can only belong
// to one department, this automatically moves them out of wherever they
// were before. No separate "unassign" step needed.

exports.assignDepartmentHead = async (req, res, next) => {
  try {
    const deptName = decodeURIComponent(req.params.name);
    const { managerId } = req.body;

    if (!Manager.DEPARTMENTS.includes(deptName)) {
      return res.status(400).json({ message: `Unknown department: ${deptName}` });
    }
    if (!managerId) {
      return res.status(400).json({ message: 'managerId is required.' });
    }

    const manager = await Manager.findById(managerId);
    if (!manager) return res.status(404).json({ message: 'Manager not found.' });

    manager.department = deptName;
    manager.departmentAssignedAt = new Date();
    manager.departmentAssignedByRole = req.user.role;
    manager.departmentAssignedById = req.user.id;
    await manager.save();

    res.json({ message: `${manager.name} is now assigned to ${deptName}.`, manager });
  } catch (err) {
    next(err);
  }
};
