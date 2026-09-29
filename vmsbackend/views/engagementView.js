/**
 * Shapes the response for "My Engagement" (14-my-engagement.html) —
 * the gamification dashboard (level ring, activity heatmap, top skills,
 * achievements). Nothing here is stored: it's recomputed fresh from real
 * Applications + Tasks on every request, the same "derived, not stored"
 * approach as certificateView.js's certificate ID.
 *
 * WHAT'S REAL vs DESIGNED:
 * - Total Hours comes ONLY from Task.contributionHours on completed
 *   (approved) Track B tasks — the one place this app records an actual
 *   number of hours. Track A has no hours field anywhere (claiming/
 *   submitting it never asks for a duration), so Track A completions add
 *   to completions/campaigns/certificates below but never to hours or the
 *   level ring.
 * - Completed / Campaigns Supported / Field Events / Certificates are all
 *   plain counts over real Application documents.
 * - Volunteer Score and the level thresholds are a designed formula (there
 *   is no external "score" concept elsewhere in this app) — documented
 *   inline so the weights can be tuned later without hunting for them.
 * - The activity heatmap buckets real timestamps (application creation,
 *   status-history entries, task submissions, volunteer's own task
 *   comments) into UTC calendar days — it's an honest "when did this
 *   volunteer's own actions land in the database" view, not a literal
 *   hours-worked log.
 * - Achievements are simple rules evaluated against the same real data,
 *   not a stored badge collection.
 */

const LEVELS = [
  { key: 'new', name: 'New Volunteer', icon: '🌿', minHours: 0 },
  { key: 'green', name: 'Green Contributor', icon: '🌱', minHours: 10 },
  { key: 'impact', name: 'Impact Volunteer', icon: '⚡', minHours: 25 },
  { key: 'champion', name: 'Green Champion', icon: '🏆', minHours: 50 },
  { key: 'hero', name: 'Sustainability Hero', icon: '🌳', minHours: 100 },
];

const HEATMAP_DAYS = 182; // ~26 weeks / 6 months — matches the mockup's 26-column grid

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function computeLevel(totalHours) {
  let current = LEVELS[0];
  let next = LEVELS[1] || null;
  for (let i = 0; i < LEVELS.length; i++) {
    if (totalHours >= LEVELS[i].minHours) {
      current = LEVELS[i];
      next = LEVELS[i + 1] || null;
    }
  }
  const progressPct = next
    ? Math.max(
        0,
        Math.min(100, Math.round(((totalHours - current.minHours) / (next.minHours - current.minHours)) * 100))
      )
    : 100;

  return {
    key: current.key,
    name: current.name,
    icon: current.icon,
    hours: totalHours,
    nextName: next ? next.name : null,
    nextMinHours: next ? next.minHours : null,
    hoursToNext: next ? Math.max(0, next.minHours - totalHours) : 0,
    progressPct,
  };
}

function buildHeatmap(activityDates) {
  const counts = new Map();
  activityDates.forEach((d) => {
    if (!d) return;
    const key = dayKey(d);
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const days = [];
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = dayKey(d);
    const count = counts.get(key) || 0;
    let level = 0;
    if (count >= 6) level = 4;
    else if (count >= 4) level = 3;
    else if (count >= 2) level = 2;
    else if (count >= 1) level = 1;
    days.push({ date: key, count, level });
  }
  return days;
}

function longestStreak(days) {
  let longest = 0;
  let current = 0;
  days.forEach((d) => {
    if (d.count > 0) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  });
  return longest;
}

function buildSkills(completedApplications) {
  const counts = {};
  completedApplications.forEach((a) => {
    (a.opportunity?.skills || []).forEach((s) => {
      counts[s] = (counts[s] || 0) + 1;
    });
  });
  const sorted = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const max = sorted.length ? sorted[0][1] : 1;
  return sorted.map(([name, count]) => ({ name, count, pct: Math.round((count / max) * 100) }));
}

function buildAchievements({ completedApplications, completedTasks, heatmapDays }) {
  const trackACompletions = completedApplications
    .filter((a) => a.track === 'a')
    .sort((a, b) => new Date(a.certificateIssuedAt || a.updatedAt) - new Date(b.certificateIssuedAt || b.updatedAt));
  const firstTree = trackACompletions[0];

  const storytellerDates = [
    ...completedApplications
      .filter((a) => a.track === 'a' && a.submission?.text?.trim())
      .map((a) => a.submission.submittedAt || a.certificateIssuedAt),
    ...completedTasks.filter((t) => t.submission?.note?.trim()).map((t) => t.submission.submittedAt),
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b));

  const trackBCompletions = completedApplications.filter((a) => a.track === 'b');
  const streak = longestStreak(heatmapDays);

  return [
    {
      key: 'first-tree',
      name: 'First Tree',
      icon: '🌱',
      desc: 'Planted your first tree',
      earned: !!firstTree,
      earnedAt: firstTree ? firstTree.certificateIssuedAt || firstTree.updatedAt : null,
    },
    {
      key: 'storyteller',
      name: 'Storyteller',
      icon: '📝',
      desc: 'Submitted first write-up',
      earned: storytellerDates.length > 0,
      earnedAt: storytellerDates[0] || null,
    },
    {
      key: 'streak-7',
      name: '7-Day Streak',
      icon: '🔥',
      desc: 'Active 7 days in a row',
      earned: streak >= 7,
      earnedAt: null,
      progress: `${Math.min(streak, 7)}/7`,
    },
    {
      key: 'team-player',
      name: 'Team Player',
      icon: '🤝',
      desc: '3 Track B completions',
      earned: trackBCompletions.length >= 3,
      earnedAt: null,
      progress: `${Math.min(trackBCompletions.length, 3)}/3`,
    },
  ];
}

function buildEngagementSummary(applications, tasks) {
  const completedApplications = applications.filter((a) => a.status === 'completed');
  const completedTasks = tasks.filter((t) => t.status === 'completed');

  // The only real hours figure in this app — see file header.
  const totalHours = completedTasks.reduce((sum, t) => sum + (t.contributionHours || 0), 0);

  const distinctOpportunities = new Set(
    completedApplications.map((a) => String(a.opportunity?._id || a.opportunity))
  );
  const fieldEvents = completedApplications.filter((a) => a.opportunity?.mode === 'Field-based').length;
  const certificatesCount = applications.filter((a) => a.certificateIssued).length;
  const completedCount = completedApplications.length;
  // Track A is this app's tree-planting/evergreen track (claim form asks
  // for planned species, the confirmation copy talks about "the work" being
  // a planting activity) — a completed Track A application is, in this
  // domain, one supported tree. Used by Dashboard.jsx's stat grid + impact
  // panel, which the mockup called "Trees Supported".
  const treesSupported = completedApplications.filter((a) => a.track === 'a').length;

  // Designed formula, not an externally-defined metric — weights are
  // deliberately simple (2x per hour, 8 per completion, 5 per certificate)
  // and easy to retune here if the real thing ever needs rebalancing.
  const volunteerScore = Math.round(totalHours * 2 + completedCount * 8 + certificatesCount * 5);

  const activityDates = [];
  applications.forEach((a) => {
    activityDates.push(a.createdAt);
    (a.statusHistory || []).forEach((h) => activityDates.push(h.at));
  });
  tasks.forEach((t) => {
    if (t.submission?.submittedAt) activityDates.push(t.submission.submittedAt);
    (t.comments || []).filter((c) => c.authorRole === 'volunteer').forEach((c) => activityDates.push(c.at));
  });

  const heatmap = buildHeatmap(activityDates);
  const level = computeLevel(totalHours);
  const currentIndex = LEVELS.findIndex((l) => l.key === level.key);
  const levelsPath = LEVELS.map((l, i) => ({
    key: l.key,
    name: l.name,
    icon: l.icon,
    minHours: l.minHours,
    done: i < currentIndex,
    current: i === currentIndex,
  }));

  return {
    level,
    levelsPath,
    metrics: {
      totalHours,
      completedCount,
      campaignsSupported: distinctOpportunities.size,
      fieldEvents,
      treesSupported,
      certificatesCount,
      volunteerScore,
    },
    heatmap,
    skills: buildSkills(completedApplications),
    achievements: buildAchievements({ completedApplications, completedTasks, heatmapDays: heatmap }),
  };
}

module.exports = { buildEngagementSummary, LEVELS };
