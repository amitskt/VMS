const Admin = require('../models/Admin');
const Manager = require('../models/Manager');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Task = require('../models/Task');

/**
 * Admin/Manager Dashboard (admin-02-dashboard.html) — real numbers and a
 * real recent-activity feed instead of the two hardcoded `DASHBOARD_DATA`
 * personas (Apurva / Vikram Suri) the frontend used to switch between by
 * role alone. Same department-scoping convention as every other admin
 * controller here: Super Admin sees every department, a Department Head
 * only ever sees their own department's opportunities/applications/tasks,
 * resolved server-side from the Manager collection.
 */

// Resolves the logged-in staff member's real name + department (department
// is null for an admin — they aren't scoped to one). Unlike the
// resolveScope() helper other admin controllers use (which only needs the
// department string), the dashboard also needs to greet the actual person
// by name, so this looks up the full Admin/Manager record rather than a
// single field.
async function resolveStaffContext(req) {
  if (req.user.role === 'admin') {
    const admin = await Admin.findById(req.user.id).select('name');
    if (!admin) return null;
    return { name: admin.name, department: null };
  }
  const manager = await Manager.findById(req.user.id).select('name department');
  if (!manager) return null;
  return { name: manager.name, department: manager.department };
}

function startOfThisMonth() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

// GET /api/admin/me — small, dedicated "who am I" endpoint for the new
// account menu's Profile page (MyProfile.jsx). dashboard-summary above
// already resolves name/department the same way via resolveStaffContext(),
// but also computes a full dashboard's worth of stats this page has no use
// for, and never returned email. req.user.email comes straight off the JWT
// (see staffAuthController.js's generateToken({ id, role, email })) so no
// extra DB lookup is needed for it.
exports.getMyProfile = async (req, res, next) => {
  try {
    const staff = await resolveStaffContext(req);
    if (!staff) {
      return res.status(403).json({ message: 'Your staff account could not be found.' });
    }
    res.json({
      name: staff.name,
      email: req.user.email,
      role: req.user.role, // 'admin' | 'manager'
      department: staff.department, // null for admin
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/dashboard-summary
exports.getDashboardSummary = async (req, res, next) => {
  try {
    const staff = await resolveStaffContext(req);
    if (!staff) {
      return res.status(403).json({ message: 'Your staff account could not be found.' });
    }
    const myDepartment = staff.department; // null for admin

    const oppFilter = myDepartment ? { depts: myDepartment } : {};
    const scopedOpportunityIds = await Opportunity.find(oppFilter).distinct('_id');

    const [activeOpps, pendingApps, tasksReview, certsMonth, recentAppsRaw, recentTasksRaw] = await Promise.all([
      Opportunity.countDocuments({ ...oppFilter, status: 'active' }),
      // "Pending Applications" — Track B applications not yet reviewed at
      // all. Matches what the Applications page itself treats as the
      // needs-attention queue.
      Application.countDocuments({
        track: 'b',
        status: 'under_review',
        opportunity: { $in: scopedOpportunityIds },
      }),
      // Tasks a volunteer has submitted work for, awaiting staff review —
      // not 'assigned'/'inprogress' (still with the volunteer) or
      // 'revision' (already sent back, ball's in the volunteer's court).
      Task.countDocuments({ status: 'submitted', opportunity: { $in: scopedOpportunityIds } }),
      Application.countDocuments({
        certificateIssued: true,
        certificateIssuedAt: { $gte: startOfThisMonth() },
        opportunity: { $in: scopedOpportunityIds },
      }),
      Application.find({ track: 'b', opportunity: { $in: scopedOpportunityIds } })
        .populate('opportunity', 'title depts')
        .populate('volunteer', 'firstName lastName')
        .select('status opportunity volunteer updatedAt')
        .sort({ updatedAt: -1 })
        .limit(5),
      Task.find({ status: 'submitted', opportunity: { $in: scopedOpportunityIds } })
        .populate('opportunity', 'title depts')
        .populate('volunteer', 'firstName lastName')
        .select('title opportunity volunteer submission')
        .sort({ 'submission.submittedAt': -1 })
        .limit(5),
    ]);

    const recentApplications = recentAppsRaw
      .filter((a) => a.opportunity && a.volunteer)
      .map((a) => ({
        id: a._id,
        volunteerName: `${a.volunteer.firstName} ${a.volunteer.lastName}`.trim() || '(no name on file)',
        opportunityTitle: a.opportunity.title,
        status: a.status,
        dept: (a.opportunity.depts || [])[0] || '—',
        at: a.updatedAt,
      }));

    const recentTasks = recentTasksRaw
      .filter((t) => t.opportunity && t.volunteer)
      .map((t) => ({
        id: t._id,
        title: t.title,
        volunteerName: `${t.volunteer.firstName} ${t.volunteer.lastName}`.trim() || '(no name on file)',
        submittedAt: t.submission?.submittedAt || null,
      }));

    res.json({
      name: staff.name,
      role: req.user.role, // 'admin' | 'manager'
      department: myDepartment, // null for admin
      departmentsCount: Manager.DEPARTMENTS.length,
      stats: { activeOpps, pendingApps, tasksReview, certsMonth },
      recentApplications,
      recentTasks,
    });
  } catch (err) {
    next(err);
  }
};
