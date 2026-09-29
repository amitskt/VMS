const Admin = require('../models/Admin');
const Manager = require('../models/Manager');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Task = require('../models/Task');
const { certificateIdFor } = require('../views/certificateView');

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

// Recent-history cap per source collection — same in-memory-merge-then-page
// approach adminApplicationController.js/adminCertificateController.js
// already use for cross-field search, just spanning multiple collections
// here instead of one. Fine for this app's scale; if this ever needs true
// unbounded history, it should become a real persisted event log written by
// each action instead of being reconstructed from existing timestamps.
const SOURCE_LIMIT = 300;

const STATUS_LABELS = {
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  task_assigned: 'Task Assigned',
  completed: 'Completed',
  not_selected: 'Not Selected',
  withdrawn: 'Withdrawn',
  claimed: 'Claimed',
  submitted: 'Submitted',
};

/**
 * Activity Log (Super Admin only, converted from admin-12-activity-log.html
 * — same "Administration section, hidden from Department Heads" gate as
 * Departments.jsx/Settings.jsx). There is no dedicated audit-log collection
 * in this project, so this reconstructs a real chronological feed from
 * timestamps/actor fields that already exist on other models, rather than
 * fabricating events:
 *
 *   - Opportunity Published  <- Opportunity.createdAt, for status==='active'
 *     opportunities only. Approximate: there's no separate `publishedAt`,
 *     so an opportunity created as a draft and activated later shows the
 *     time it was first created, not when it went active. Good enough for
 *     the common case (created straight into Active from
 *     CreateEditOpportunity.jsx), flagged here rather than silently wrong.
 *   - Application Status Change  <- Application.statusHistory's latest
 *     entry, ONLY when Application.reviewedByRole is set — that field is
 *     exclusively set by staff-driven transitions (Track B review in
 *     adminApplicationController.updateStatus, task assignment/approval in
 *     adminTaskController.js). Track A's auto claim/submit flow never sets
 *     it, so those don't show up here as if a staff member did something —
 *     correctly, since nobody did. Older statusHistory entries aren't each
 *     shown as separate events: only the most recent transition is, since
 *     the schema never recorded WHO made an earlier one, and guessing would
 *     mean fabricating an actor.
 *   - Task Assigned  <- Task.createdAt + assignedByRole/assignedById.
 *   - Task Approved  <- a Task with status 'completed', using
 *     Task.updatedAt (no further writes ever happen to a completed task —
 *     see adminTaskController.updateTaskStatus's early-return guard — so
 *     this is exactly the approval moment) + the linked Application's
 *     reviewedByRole/reviewedById (set in the same request that completes
 *     the task).
 *   - Certificate Generated  <- Application.certificateIssuedAt, for
 *     certificateIssued:true applications. No actor shown, matching the
 *     mockup — a certificate is auto-issued the instant a track completes,
 *     not a separate staff action.
 *   - Department Head Assigned  <- Manager.departmentAssignedAt/
 *     departmentAssignedByRole/departmentAssignedById (added to the Manager
 *     model alongside this feature — see its own comment for why
 *     Manager.updatedAt alone couldn't be reused: that also changes on an
 *     unrelated isActive toggle, which would have misattributed events).
 */

// Batches all Admin/Manager name lookups into two in-memory maps instead of
// one query per event — both collections are small (a handful of staff
// accounts), so fetching them whole is cheap and avoids an N+1 pattern.
async function buildActorResolver() {
  const [admins, managers] = await Promise.all([
    Admin.find({}).select('name'),
    Manager.find({}).select('name'),
  ]);
  const adminMap = new Map(admins.map((a) => [String(a._id), a.name]));
  const managerMap = new Map(managers.map((m) => [String(m._id), m.name]));

  return (role, id) => {
    if (!role || !id) return null;
    if (role === 'admin') return adminMap.get(String(id)) || 'Admin';
    if (role === 'manager') return managerMap.get(String(id)) || 'Department Head';
    return null;
  };
}

function primaryDept(depts) {
  return (depts || [])[0] || '—';
}

// GET /api/admin/activity-log?search=&type=&page=&limit=
exports.listActivityLog = async (req, res, next) => {
  try {
    const resolveActor = await buildActorResolver();

    const [opportunities, applications, tasks, certificates, deptAssignments] = await Promise.all([
      Opportunity.find({ status: 'active' })
        .select('title depts createdByRole createdById createdAt')
        .sort({ createdAt: -1 })
        .limit(SOURCE_LIMIT),
      Application.find({ reviewedByRole: { $in: ['admin', 'manager'] } })
        .populate('opportunity', 'title depts')
        .populate('volunteer', 'firstName lastName')
        .select('status statusHistory reviewedByRole reviewedById opportunity volunteer updatedAt')
        .sort({ updatedAt: -1 })
        .limit(SOURCE_LIMIT),
      Task.find({})
        .populate('opportunity', 'title depts')
        .populate('volunteer', 'firstName lastName')
        .populate('application', 'reviewedByRole reviewedById status')
        .select('status assignedByRole assignedById opportunity volunteer application createdAt updatedAt')
        .sort({ createdAt: -1 })
        .limit(SOURCE_LIMIT),
      Application.find({ certificateIssued: true })
        .populate('opportunity', 'title depts')
        .populate('volunteer', 'firstName lastName')
        .select('certificateIssuedAt opportunity volunteer track')
        .sort({ certificateIssuedAt: -1 })
        .limit(SOURCE_LIMIT),
      Manager.find({ departmentAssignedAt: { $ne: null } })
        .select('name department departmentAssignedAt departmentAssignedByRole departmentAssignedById')
        .sort({ departmentAssignedAt: -1 })
        .limit(SOURCE_LIMIT),
    ]);

    const events = [];

    for (const opp of opportunities) {
      events.push({
        id: `opp-${opp._id}`,
        type: 'opp',
        actorName: resolveActor(opp.createdByRole, opp.createdById),
        description: `published ${opp.title}`,
        meta: (opp.depts || []).join(', ') || 'No department',
        at: opp.createdAt,
      });
    }

    for (const app of applications) {
      if (!app.opportunity || !app.volunteer) continue;
      const volunteerName = `${app.volunteer.firstName} ${app.volunteer.lastName}`.trim() || '(no name on file)';
      const last = (app.statusHistory || [])[app.statusHistory.length - 1];
      events.push({
        id: `app-${app._id}`,
        type: 'app',
        actorName: resolveActor(app.reviewedByRole, app.reviewedById),
        description: `moved ${volunteerName}'s application for ${app.opportunity.title} to ${
          STATUS_LABELS[app.status] || app.status
        }`,
        meta: primaryDept(app.opportunity.depts),
        at: (last && last.at) || app.updatedAt,
      });
    }

    for (const task of tasks) {
      if (!task.opportunity || !task.volunteer) continue;
      const volunteerName = `${task.volunteer.firstName} ${task.volunteer.lastName}`.trim() || '(no name on file)';
      const dept = primaryDept(task.opportunity.depts);

      events.push({
        id: `task-${task._id}`,
        type: 'task',
        actorName: resolveActor(task.assignedByRole, task.assignedById),
        description: `assigned a task to ${volunteerName} for ${task.opportunity.title}`,
        meta: dept,
        at: task.createdAt,
      });

      if (task.status === 'completed') {
        events.push({
          id: `approve-${task._id}`,
          type: 'approve',
          actorName: task.application ? resolveActor(task.application.reviewedByRole, task.application.reviewedById) : null,
          description: `approved submitted work for ${volunteerName} — ${task.opportunity.title}`,
          meta: dept,
          at: task.updatedAt,
        });
      }
    }

    for (const cert of certificates) {
      if (!cert.opportunity || !cert.volunteer) continue;
      const volunteerName = `${cert.volunteer.firstName} ${cert.volunteer.lastName}`.trim() || '(no name on file)';
      events.push({
        id: `cert-${cert._id}`,
        type: 'cert',
        actorName: null, // auto-issued the instant a track completes — no staff actor to attribute
        description: `Certificate ${certificateIdFor(cert)} generated for ${volunteerName} — ${cert.opportunity.title}`,
        meta: primaryDept(cert.opportunity.depts),
        at: cert.certificateIssuedAt,
      });
    }

    for (const mgr of deptAssignments) {
      events.push({
        id: `dept-${mgr._id}-${+mgr.departmentAssignedAt}`,
        type: 'dept',
        actorName: resolveActor(mgr.departmentAssignedByRole, mgr.departmentAssignedById),
        description: `assigned ${mgr.name} as Department Head for ${mgr.department}`,
        meta: null,
        at: mgr.departmentAssignedAt,
      });
    }

    events.sort((a, b) => new Date(b.at) - new Date(a.at));

    const { search, type } = req.query;
    let filtered = events;
    if (type && type !== 'all') filtered = filtered.filter((e) => e.type === type);
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter((e) =>
        `${e.actorName || ''} ${e.description} ${e.meta || ''}`.toLowerCase().includes(q)
      );
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));
    const total = filtered.length;
    const pageItems = filtered.slice((page - 1) * limit, page * limit);

    res.json({
      events: pageItems,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
};
