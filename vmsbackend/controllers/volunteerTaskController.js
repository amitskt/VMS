const Task = require('../models/Task');
const Application = require('../models/Application');
const Volunteer = require('../models/Volunteer');
const { toPublicApplication } = require('../views/applicationView');
const { toPublicTask } = require('../views/taskView');
const { uploadBuffer, uploadBufferForVolunteer } = require('../utils/driveUpload');
const { resolveActorName } = require('../utils/actorName');

/**
 * My Tasks (12-my-tasks.html). Deliberately two different data sources for
 * the two sections, per how this app's Track A/B lifecycles actually work:
 *
 * - Track A has no Task document — its whole "claim -> submit -> instant
 *   certificate" lifecycle already lives on the Application itself (see
 *   volunteerApplicationController.submitTrackA), so the Track A section
 *   here just reads the volunteer's own Track A applications directly.
 * - Track B tasks only exist once a manager/admin has actually assigned one
 *   from the Task Board (adminTaskController.createTask) — a Track B
 *   application sitting at 'under_review'/'shortlisted' has nothing to
 *   show here yet, by design (that's what My Applications is
 *   for). This matches the explicit rule: Track B appears in My Tasks only
 *   once a manager has assigned a task; Track A appears as soon as it's
 *   claimed.
 */

// GET /api/volunteer/tasks
exports.listMyTasks = async (req, res, next) => {
  try {
    const [trackAApps, trackBTasks] = await Promise.all([
      Application.find({ volunteer: req.user.id, track: 'a', status: { $ne: 'withdrawn' } })
        .populate('opportunity')
        .sort({ createdAt: -1 }),
      Task.find({ volunteer: req.user.id }).populate('opportunity').sort({ createdAt: -1 }),
    ]);

    res.json({
      trackA: trackAApps.filter((a) => a.opportunity).map((a) => toPublicApplication(a, a.opportunity)),
      trackB: trackBTasks.filter((t) => t.opportunity).map((t) => toPublicTask(t, t.opportunity)),
    });
  } catch (err) {
    next(err);
  }
};

// POST /api/volunteer/tasks/:id/submit   multipart/form-data: file? , link?, note?
// Either a file (uploaded to amit@sankalptaru.org's Google Drive) or a
// pasted link is required, never neither — matches 12-my-tasks.html's
// "upload or paste a link" pattern, now backed by real storage instead of
// a mock.
exports.submitTask = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, volunteer: req.user.id }).populate('opportunity');
    if (!task) return res.status(404).json({ message: 'Task not found.' });
    if (task.status === 'submitted' || task.status === 'completed') {
      return res.status(400).json({ message: 'This task has already been submitted.' });
    }

    const link = (req.body.link || '').trim();
    const note = (req.body.note || '').trim();

    if (!req.file && !link) {
      return res.status(400).json({ message: 'Attach a file or paste a link to submit this task.' });
    }

    let fileUrl = '';
    let fileName = '';
    if (req.file) {
      // Uploaded into this volunteer's own Drive folder (same one their
      // photo/resume/certificates live in) — see utils/driveUpload.js's
      // uploadBufferForVolunteer. Falls back to the flat root folder only
      // in the unlikely case the volunteer record can't be found.
      const volunteer = await Volunteer.findById(req.user.id).select('email');
      const uploaded = volunteer?.email
        ? await uploadBufferForVolunteer(req.file.buffer, req.file.originalname, req.file.mimetype, 'tasks', volunteer.email)
        : await uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, 'tasks');
      fileUrl = uploaded.url;
      fileName = req.file.originalname;
    }

    task.submission = { fileUrl, fileName, link, note, submittedAt: new Date() };
    task.status = 'submitted';
    await task.save();

    res.json({ message: 'Task submitted for review.', task: toPublicTask(task, task.opportunity) });
  } catch (err) {
    next(err);
  }
};

// POST /api/volunteer/tasks/:id/comments   body: { text }
exports.addComment = async (req, res, next) => {
  try {
    const task = await Task.findOne({ _id: req.params.id, volunteer: req.user.id }).populate('opportunity');
    if (!task) return res.status(404).json({ message: 'Task not found.' });

    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Comment cannot be empty.' });

    const authorName = await resolveActorName(req);
    task.comments.push({ authorRole: 'volunteer', authorName, text, at: new Date() });
    await task.save();

    res.json({ message: 'Comment added.', task: toPublicTask(task, task.opportunity) });
  } catch (err) {
    next(err);
  }
};
