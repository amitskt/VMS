const Application = require('../models/Application');
const Task = require('../models/Task');
const { buildEngagementSummary } = require('../views/engagementView');

// GET /api/volunteer/engagement — backs 14-my-engagement.html (My Engagement).
// Recomputed fresh from this volunteer's real Applications + Tasks on every
// request (nothing is cached or stored), so it always reflects whatever a
// manager/admin most recently approved — the moment a Track B task is
// marked completed with hours, or a Track A submission is accepted, this
// endpoint's numbers change on the volunteer's very next load/refresh. See
// views/engagementView.js's file header for exactly what's real data here
// vs a designed gamification formula.
exports.getMyEngagement = async (req, res, next) => {
  try {
    const [applications, tasks] = await Promise.all([
      Application.find({ volunteer: req.user.id }).populate('opportunity').lean(),
      Task.find({ volunteer: req.user.id }).lean(),
    ]);

    res.json(buildEngagementSummary(applications, tasks));
  } catch (err) {
    next(err);
  }
};
