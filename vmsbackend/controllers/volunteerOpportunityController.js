const Volunteer = require('../models/Volunteer');
const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const { toPublicOpportunity } = require('../views/opportunityView');
const { toPublicApplication } = require('../views/applicationView');
const { computeMatches, isCacheStale, profileSignature, opportunitySignature, GEMINI_MODEL } = require('../utils/geminiMatcher');
const { getShortlistedCounts, isOpportunityFull } = require('../utils/opportunityCapacity');

/**
 * Volunteer-facing opportunity discovery: Dashboard's "Recommended For You"
 * preview, the full Opportunities list (Opportunities.jsx), and the
 * Opportunity Detail page all read through here.
 *
 * Track A ("no skill barrier, auto-approved") is shown in full regardless of
 * match score — that's the whole point of Track A per the Create Opportunity
 * rules (opportunityController.js), so there's nothing for Gemini to rank
 * there. Only Track B opportunities go through matching.
 *
 * Matches are cached on the volunteer document (models/Volunteer.js) and
 * only recomputed when the volunteer's profile or the live set of Track B
 * opportunities has actually changed since the last computation — see
 * utils/geminiMatcher.js's isCacheStale(). getMyScoredTrackB() below is the
 * single place that cache-check-or-recompute happens, shared by every
 * endpoint in this file so the list, the dashboard preview, and a single
 * opportunity's detail page can never disagree with each other or trigger
 * redundant Gemini calls in the same request cycle.
 */

// Returns { evergreen: [Opportunity docs, track a], trackB: [Opportunity docs, track b],
//           scored: [{...toPublicOpportunity, matchScore, matchReasons}], usedFallback }
async function getMyScoredTrackB(req) {
  const volunteer = await Volunteer.findById(req.user.id);
  if (!volunteer) {
    const err = new Error('Volunteer not found.');
    err.status = 404;
    throw err;
  }

  const activeOpportunities = await Opportunity.find({ status: 'active' }).sort({ createdAt: -1 });
  const evergreen = activeOpportunities.filter((o) => o.track === 'a');
  const trackB = activeOpportunities.filter((o) => o.track === 'b');

  let matches;
  let usedFallback = false;

  if (!isCacheStale(volunteer, trackB)) {
    // Cache hit — reuse stored scores, but always resolve them against the
    // live opportunity documents (never store denormalized copies of
    // title/overview/etc. in the cache itself, so an admin editing an
    // unrelated field on the same opportunity can't leave stale text
    // showing here between recomputes).
    const byId = new Map(trackB.map((o) => [String(o._id), o]));
    matches = volunteer.matchCache.matches
      .map((m) => ({ opportunityId: String(m.opportunity), score: m.score, reasons: m.reasons }))
      .filter((m) => byId.has(m.opportunityId));
    usedFallback = volunteer.matchCache.usedFallback;
  } else {
    const result = await computeMatches(volunteer, trackB);
    matches = result.matches;
    usedFallback = result.usedFallback;

    const newMatchCache = {
      computedAt: new Date(),
      profileSignature: profileSignature(volunteer),
      opportunitySignature: opportunitySignature(trackB),
      modelUsed: GEMINI_MODEL,
      usedFallback,
      matches: matches.map((m) => ({ opportunity: m.opportunityId, score: m.score, reasons: m.reasons })),
    };

    // Written as a targeted atomic update, not `volunteer.save()`. The
    // Gemini call above can take a second or more (longer still with
    // geminiMatcher's retry-on-503 backoff), which is plenty of time for a
    // concurrent request — another tab loading the same recommendations, or
    // a bookmark toggle's $addToSet on savedOpportunities, which Mongoose
    // auto-versions — to touch this same volunteer document first. A
    // whole-document `.save()` would then (a) throw a VersionError because
    // its optimistic-concurrency check targets a __v that's no longer
    // current, and worse, (b) if it landed just before that check instead of
    // after, silently overwrite savedOpportunities back to whatever this
    // in-memory copy had when it was first loaded — quietly reverting the
    // other request's save/unsave. `matchCache` is pure cache: last-writer-
    // wins here is correct (the loser's own scores are still used for this
    // response, just not persisted), so an untargeted, unversioned update is
    // both simpler and safer than the whole-document save it replaces.
    await Volunteer.updateOne({ _id: volunteer._id }, { $set: { matchCache: newMatchCache } });
    volunteer.matchCache = newMatchCache;
  }

  // Capacity check — how many volunteers are already shortlisted (or
  // further) on each Track B opportunity, so a full one can be shown as
  // unavailable instead of letting more volunteers apply into a project
  // that's already staffed. See utils/opportunityCapacity.js for exactly
  // which statuses count as "holding a slot".
  const shortlistedCounts = await getShortlistedCounts(trackB.map((o) => o._id));

  const scoreById = new Map(matches.map((m) => [m.opportunityId, m]));
  const scored = trackB.map((o) => {
    const m = scoreById.get(String(o._id));
    const shortlistedCount = shortlistedCounts.get(String(o._id)) || 0;
    return {
      ...toPublicOpportunity(o),
      matchScore: m ? m.score : 0,
      matchReasons: m ? m.reasons : [],
      shortlistedCount,
      isFull: isOpportunityFull(o, shortlistedCount),
    };
  });

  return { evergreen, trackB, scored, usedFallback };
}

// GET /api/volunteer/opportunities/meta
// Real skill/mode taxonomy for the filter dropdowns on Opportunities.jsx —
// same idea as opportunityController.js's admin-side /opportunities/meta.
exports.getMeta = async (req, res, next) => {
  try {
    res.json({ skills: Opportunity.SKILLS, modes: Opportunity.MODES });
  } catch (err) {
    next(err);
  }
};

// GET /api/volunteer/opportunities/recommended?limit=20
// Dashboard.jsx's compact "Recommended For You" preview.
//
// Track B matching only makes sense once the volunteer has actually
// selected skills (Skill.jsx's Step 3, or EditProfile.jsx's Skills
// section) — matching against an empty skill set produces meaningless
// scores, and would otherwise burn a Gemini call for every volunteer who
// skipped that step (see Skill.jsx's now-fixed "Skip for now" button and
// Profile.jsx's, which always let a volunteer move on without finishing
// skills). So: no skills selected -> skip Track B matching entirely and
// return only Track A ("Always Open"). Track A is returned here
// regardless of skills AND regardless of overall profile completion —
// it never needed either; that's the whole point of Track A.
exports.getRecommendedOpportunities = async (req, res, next) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));

    const volunteer = await Volunteer.findById(req.user.id).select('totalSkills');
    const hasSkills = !!volunteer && volunteer.totalSkills > 0;

    if (!hasSkills) {
      const evergreen = await Opportunity.find({ status: 'active', track: 'a' }).sort({ createdAt: -1 });
      return res.json({
        evergreen: evergreen.map(toPublicOpportunity),
        recommended: [],
        usedFallback: false,
      });
    }

    const { evergreen, scored, usedFallback } = await getMyScoredTrackB(req);
    const recommended = [...scored].sort((a, b) => b.matchScore - a.matchScore).slice(0, limit);

    res.json({
      evergreen: evergreen.map(toPublicOpportunity),
      recommended,
      usedFallback,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/volunteer/opportunities?search=&mode=&skill=&sort=match|newest|alpha&page=&limit=
// Opportunities.jsx's full browsing/filtering/pagination view.
exports.listOpportunities = async (req, res, next) => {
  try {
    const { search, mode, skill } = req.query;
    const sort = ['match', 'newest', 'alpha'].includes(req.query.sort) ? req.query.sort : 'match';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 9));

    const { evergreen, scored, usedFallback } = await getMyScoredTrackB(req);

    let filtered = scored;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (o) => o.title.toLowerCase().includes(q) || o.overview.toLowerCase().includes(q)
      );
    }
    if (mode && Opportunity.MODES.includes(mode)) {
      filtered = filtered.filter((o) => o.mode === mode);
    }
    if (skill && Opportunity.SKILLS.includes(skill)) {
      filtered = filtered.filter((o) => o.skills.includes(skill));
    }

    if (sort === 'newest') {
      filtered = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } else if (sort === 'alpha') {
      filtered = [...filtered].sort((a, b) => a.title.localeCompare(b.title));
    } else {
      filtered = [...filtered].sort((a, b) => b.matchScore - a.matchScore);
    }

    const total = filtered.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const pageItems = filtered.slice((page - 1) * limit, page * limit);

    // Evergreen strip is always shown in full (a small, curated highlight),
    // never filtered/paginated — matching its "always accepting, open to
    // everyone" role. Real Track A opportunities only (see file header
    // comment) — the original mockup's evergreen strip mixed in a Track B
    // example, but Track B always requires manager review in this app's
    // actual rules, so that's not something we can honestly show as
    // "always open" here.
    res.json({
      evergreen: evergreen.map(toPublicOpportunity),
      opportunities: pageItems,
      total,
      page,
      pages,
      usedFallback,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/volunteer/opportunities/:id
exports.getOpportunityDetail = async (req, res, next) => {
  try {
    const opp = await Opportunity.findById(req.params.id);
    if (!opp || opp.status !== 'active') {
      return res.status(404).json({ message: 'This opportunity is no longer available.' });
    }

    // Shared by both branches below — lets OpportunityDetail.jsx render the
    // right CTA (Save/Unsave, Apply/Claim vs. "already applied") without a
    // second round trip.
    const [volunteer, myApplication] = await Promise.all([
      Volunteer.findById(req.user.id).select('savedOpportunities'),
      Application.findOne({ volunteer: req.user.id, opportunity: opp._id }).sort({ createdAt: -1 }),
    ]);
    const isSaved = !!volunteer?.savedOpportunities?.some((id) => String(id) === req.params.id);
    const myApplicationPublic = myApplication ? toPublicApplication(myApplication, opp) : null;

    if (opp.track === 'a') {
      // Track A is never capacity-limited (Opportunity.capacity is
      // schema-enforced null for it), so it's never "full" — these fields
      // are just here so OpportunityDetail.jsx can read opportunity.isFull
      // unconditionally regardless of track.
      return res.json({
        opportunity: {
          ...toPublicOpportunity(opp),
          isEvergreen: true,
          matchScore: null,
          matchReasons: [],
          isSaved,
          shortlistedCount: 0,
          isFull: false,
        },
        similar: [],
        myApplication: myApplicationPublic,
      });
    }

    const { scored, usedFallback } = await getMyScoredTrackB(req);
    const mine = scored.find((o) => o.id.toString() === req.params.id);
    if (!mine) {
      return res.status(404).json({ message: 'This opportunity is no longer available.' });
    }

    const similar = scored
      .filter((o) => o.id.toString() !== req.params.id)
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 3);

    res.json({
      opportunity: { ...mine, isEvergreen: false, isSaved },
      similar,
      usedFallback,
      myApplication: myApplicationPublic,
    });
  } catch (err) {
    next(err);
  }
};
