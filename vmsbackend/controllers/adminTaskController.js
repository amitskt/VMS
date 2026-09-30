const Task = require('../models/Task');
const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Manager = require('../models/Manager');
const { toPublicTask } = require('../views/taskView');
const { defaultNextStep, adjustAppsCountOnTransition } = require('../utils/applicationLifecycle');
const { resolveActorName } = require('../utils/actorName');
const { notifyTaskAssigned, notifyTaskInProgress, notifyRevisionNeeded, notifyTrackBCompleted } = require('../utils/notifyVolunteer');
const { pinActiveCertificateTemplate, uploadCertificateToDrive } = require('../utils/certificateData');

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

/**
 * Task Board (Super Admin + Department Heads) — converted from
 * admin-09-task-board.html. Only exists for Track B: a Task is created here
 * once an application has been moved to 'shortlisted' on the Applications
 * screen (adminApplicationController.js) — the old separate 'selected' step
 * was removed, so 'shortlisted' is now the only gate before task assignment
 * — and completing it flips that same application to 'completed' + issues
 * its certificate — same finalization adminApplicationController.updateStatus
 * already does for a direct Track B completion, just triggered from this
 * screen instead.
 *
 * Same department-scoping convention as every other admin controller here:
 * a manager only ever sees/manages tasks against opportunities their own
 * department owns, resolved server-side from the Manager collection.
 */

async function resolveScope(req) {
  if (req.user.role !== 'manager') return null;
  const manager = await Manager.findById(req.user.id).select('department');
  return manager ? manager.department : undefined;
}

// GET /api/admin/tasks/meta
exports.getMeta = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }
    res.json({ statuses: Task.TASK_STATUSES, departments: Opportunity.DEPARTMENTS, myDepartment });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/tasks/assignable
// Shortlisted Track B applications that don't have a task yet — the pool the
// Assign Task modal's volunteer dropdown picks from.
exports.listAssignable = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const oppFilter = { };
    if (myDepartment) oppFilter.depts = myDepartment;
    const scopedOpportunityIds = await Opportunity.find(oppFilter).distinct('_id');

    const alreadyTasked = await Task.find({}).distinct('application');

    const applications = await Application.find({
      track: 'b',
      status: 'shortlisted',
      opportunity: { $in: scopedOpportunityIds },
      _id: { $nin: alreadyTasked },
    })
      .populate('opportunity', 'title depts')
      .populate('volunteer', 'firstName lastName')
      .sort({ createdAt: -1 });

    res.json({
      applications: applications
        .filter((a) => a.opportunity && a.volunteer)
        .map((a) => ({
          id: a._id,
          volunteerName: `${a.volunteer.firstName} ${a.volunteer.lastName}`.trim() || '(no name on file)',
          opportunityTitle: a.opportunity.title,
        })),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/tasks?status=&department=&search=&page=&limit=
exports.listTasks = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const oppFilter = {};
    if (myDepartment) oppFilter.depts = myDepartment;
    else if (req.query.department && req.query.department !== 'all') oppFilter.depts = req.query.department;
    const scopedOpportunityIds = await Opportunity.find(oppFilter).distinct('_id');

    const taskFilter = { opportunity: { $in: scopedOpportunityIds } };
    if (req.query.status && Task.TASK_STATUSES.includes(req.query.status)) {
      taskFilter.status = req.query.status;
    }

    let tasks = await Task.find(taskFilter)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email photoUrl')
      .sort({ createdAt: -1 });

    tasks = tasks.filter((t) => t.opportunity && t.volunteer);

    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
      tasks = tasks.filter((t) => {
        const volunteerName = `${t.volunteer.firstName} ${t.volunteer.lastName}`.toLowerCase();
        return volunteerName.includes(search) || t.title.toLowerCase().includes(search) || t.opportunity.title.toLowerCase().includes(search);
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));
    const total = tasks.length;
    const pageItems = tasks.slice((page - 1) * limit, page * limit);

    res.json({
      tasks: pageItems.map((t) => ({
        ...toPublicTask(t, t.opportunity),
        department: (t.opportunity.depts || [])[0] || '—',
        volunteer: {
          id: t.volunteer._id,
          name: `${t.volunteer.firstName} ${t.volunteer.lastName}`.trim() || '(no name on file)',
          email: t.volunteer.email,
          photoUrl: t.volunteer.photoUrl || '',
        },
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      myDepartment,
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/admin/tasks   body: { applicationId, title, description, dueDate, reportingPerson, submissionInstructions? }
exports.createTask = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const { applicationId, title, description, dueDate, reportingPerson, submissionInstructions } = req.body;
    if (!title || !description || !dueDate || !reportingPerson) {
      return res.status(400).json({ message: 'Task title, description, due date, and reporting person are all required.' });
    }

    const application = await Application.findById(applicationId)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email');
    if (!application || !application.opportunity) {
      return res.status(404).json({ message: 'Application not found.' });
    }
    if (myDepartment && !application.opportunity.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This application isn't owned by ${myDepartment}.` });
    }
    if (application.track !== 'b') {
      return res.status(400).json({ message: 'Tasks can only be assigned for Track B applications.' });
    }
    if (application.status !== 'shortlisted') {
      return res.status(400).json({ message: 'A task can only be assigned once this application has been moved to Shortlisted.' });
    }

    const existing = await Task.findOne({ application: application._id });
    if (existing) {
      return res.status(400).json({ message: 'A task has already been assigned for this application.' });
    }

    const task = await Task.create({
      application: application._id,
      opportunity: application.opportunity._id,
      volunteer: application.volunteer._id,
      title,
      description,
      dueDate,
      reportingPerson,
      submissionInstructions: submissionInstructions || '',
      assignedByRole: req.user.role,
      assignedById: req.user.id,
    });

    application.status = 'task_assigned';
    application.statusHistory.push({ status: 'task_assigned', at: new Date() });
    application.nextStep = defaultNextStep('task_assigned');
    application.reviewedByRole = req.user.role;
    application.reviewedById = req.user.id;
    await application.save();
    // 'shortlisted' -> 'task_assigned' never crosses the terminal boundary,
    // so no adjustAppsCountOnTransition call is needed here (see its own
    // comment for why that only fires on a terminal<->non-terminal edge).

    // Fire-and-forget — see notifyVolunteer.js's header comment.
    if (application.volunteer) {
      notifyTaskAssigned(application.volunteer, application.opportunity, task);
    }

    res.status(201).json({ message: 'Task assigned.', task: toPublicTask(task, application.opportunity) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    if (err.code === 11000) {
      return res.status(400).json({ message: 'A task has already been assigned for this application.' });
    }
    next(err);
  }
};

// PATCH /api/admin/tasks/:id/status   body: { status, contributionHours?, feedback? }
// Drives the Task Board's drag-and-drop between columns, plus the review
// modal's Approve (-> completed, requires contributionHours) and Request
// Revision (-> revision, feedback becomes a comment) actions.
exports.updateTaskStatus = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const task = await Task.findById(req.params.id)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email');
    if (!task || !task.opportunity) {
      return res.status(404).json({ message: 'Task not found.' });
    }
    if (myDepartment && !task.opportunity.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This task isn't owned by ${myDepartment}.` });
    }
    if (task.status === 'completed') {
      return res.status(400).json({ message: 'This task is already completed.' });
    }

    const { status, contributionHours, feedback } = req.body;
    if (!Task.TASK_STATUSES.includes(status)) {
      return res.status(400).json({ message: `Status must be one of: ${Task.TASK_STATUSES.join(', ')}.` });
    }

    if (status === 'completed') {
      const hours = parseFloat(contributionHours);
      if (!hours || hours <= 0) {
        return res.status(400).json({ message: 'Enter contribution hours before approving this task.' });
      }
      task.contributionHours = hours;
    }

    let revisionFeedback = null;
    if (status === 'revision' && feedback && feedback.trim()) {
      revisionFeedback = feedback.trim();
      const authorName = await resolveActorName(req);
      task.comments.push({ authorRole: req.user.role, authorName, text: revisionFeedback, at: new Date() });
    }

    task.status = status;
    await task.save();

    // Fire-and-forget — see notifyVolunteer.js's header comment. Unconditional
    // on the status transition itself (same as Shortlisted/Task Assigned),
    // NOT on whether feedback text was supplied. Feedback is optional on the
    // Task Board (it's only shown as a comment when given, and a task can
    // also land on 'revision' via a plain drag-and-drop between board
    // columns with no feedback at all) — but the volunteer should always be
    // told a revision was requested either way, so a generic message is used
    // when no specific feedback was given instead of skipping the email.
    if (status === 'revision' && task.volunteer) {
      notifyRevisionNeeded(
        task.volunteer,
        task.opportunity,
        task,
        revisionFeedback || 'Please review your submission and make the requested changes.'
      );
    }

    if (status === 'inprogress' && task.volunteer) {
      notifyTaskInProgress(task.volunteer, task.opportunity, task);
    }

    if (status === 'completed') {
      const application = await Application.findById(task.application).populate('volunteer', 'firstName lastName email');
      if (application) {
        const fromStatus = application.status;
        const now = new Date();
        application.status = 'completed';
        application.statusHistory.push({ status: 'completed', at: now });
        application.nextStep = defaultNextStep('completed');
        application.certificateIssued = true;
        application.certificateIssuedAt = now;
        application.reviewedByRole = req.user.role;
        application.reviewedById = req.user.id;
        await pinActiveCertificateTemplate(application);
        await application.save();
        await adjustAppsCountOnTransition(application.opportunity, fromStatus, 'completed');

        // Fire-and-forget, includes the certificate PDF as an attachment —
        // see notifyVolunteer.js's header comment.
        if (application.volunteer) {
          notifyTrackBCompleted(application.volunteer, task.opportunity, application, task);
          uploadCertificateToDrive(application, task.opportunity, application.volunteer);
        }
      }
    }

    res.json({ message: 'Task updated.', task: toPublicTask(task, task.opportunity) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

// POST /api/admin/tasks/:id/comments   body: { text }
exports.addComment = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const task = await Task.findById(req.params.id).populate('opportunity');
    if (!task || !task.opportunity) {
      return res.status(404).json({ message: 'Task not found.' });
    }
    if (myDepartment && !task.opportunity.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This task isn't owned by ${myDepartment}.` });
    }

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Comment cannot be empty.' });

    const authorName = await resolveActorName(req);
    task.comments.push({ authorRole: req.user.role, authorName, text, at: new Date() });
    await task.save();

    res.json({ message: 'Comment added.', task: toPublicTask(task, task.opportunity) });
  } catch (err) {
    next(err);
  }
};
