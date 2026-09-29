const Opportunity = require('../models/Opportunity');
const Application = require('../models/Application');
const Volunteer = require('../models/Volunteer');

/**
 * Unauthenticated data for the public landing page (Home.jsx). Everything
 * here used to be hardcoded fake numbers/opportunities baked into the
 * frontend (50,000 "Trees Planted", "1,240 claimed", a fictional "Priya S.
 * just earned a certificate!" card, four made-up opportunity cards) — this
 * replaces all of it with real aggregates and real Opportunity documents.
 * No auth/JWT here on purpose: a visitor hasn't logged in yet.
 */

// GET /api/public/opportunities?limit=6
// Evergreen (Track A) opportunities never fill up/expire, so — matching the
// "Always Open" framing used everywhere else in this app — they're listed
// first, with Track B projects filling the remaining slots. `claimedCount`
// is a real lifetime count of every Application ever created against that
// opportunity (any status), not the mockup's invented "1,240 claimed".
// There's no match-scoring here (that needs a logged-in volunteer's own
// skills profile — see volunteerOpportunityController.js) and no skills
// requirement text is asserted beyond what's actually stored, since
// Opportunity.skills is real data for every track.
exports.listPublicOpportunities = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 6, 12);

    const [evergreen, skilled] = await Promise.all([
      Opportunity.find({ status: 'active', track: 'a' }).sort({ createdAt: -1 }).limit(limit).lean(),
      Opportunity.find({ status: 'active', track: 'b' }).sort({ createdAt: -1 }).limit(limit).lean(),
    ]);

    const picked = [...evergreen, ...skilled].slice(0, limit);
    const claimedCounts = await Promise.all(
      picked.map((o) => Application.countDocuments({ opportunity: o._id }))
    );

    res.json({
      opportunities: picked.map((o, i) => ({
        id: o._id,
        title: o.title,
        overview: o.overview,
        track: o.track,
        mode: o.mode,
        duration: o.duration,
        timeCommitment: o.timeCommitment,
        skills: o.skills,
        capacity: o.capacity,
        claimedCount: claimedCounts[i],
      })),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/public/opportunities/:id
// Full detail for the click-through from Home.jsx's cards/hero preview
// (the "detailed view" modal) — same shape as the list endpoint above plus
// the long-form copy (overview/whatYouWillDo/whatYouWillLearn) and, for a
// capacity-limited Track B project, a real spotsLeft (capacity minus
// currently-open applications, via Opportunity.apps — see that model's own
// comment on what `apps` tracks). Track A always has null capacity
// (schema-enforced), so spotsLeft is always null there — "Always Open"
// stays literally true rather than a claim with a fake number behind it.
exports.getPublicOpportunity = async (req, res, next) => {
  try {
    const opp = await Opportunity.findOne({ _id: req.params.id, status: 'active' }).lean();
    if (!opp) return res.status(404).json({ message: 'This opportunity is no longer available.' });

    const claimedCount = await Application.countDocuments({ opportunity: opp._id });
    const spotsLeft = opp.capacity != null ? Math.max(0, opp.capacity - (opp.apps || 0)) : null;

    res.json({
      opportunity: {
        id: opp._id,
        title: opp.title,
        overview: opp.overview,
        whatYouWillDo: opp.whatYouWillDo,
        whatYouWillLearn: opp.whatYouWillLearn,
        track: opp.track,
        mode: opp.mode,
        duration: opp.duration,
        timeCommitment: opp.timeCommitment,
        skills: opp.skills,
        capacity: opp.capacity,
        claimedCount,
        spotsLeft,
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/public/stats
// All four numbers on the hero/stats bands, all real:
// - Trees Planted: Track A is this app's tree-planting/evergreen track (see
//   engagementView.js's identical reasoning) — a completed Track A
//   application is one planted tree, counted across every volunteer.
// - Volunteers: every registered Volunteer account.
// - Districts Covered: distinct non-empty Volunteer.district values — real
//   because Profile.jsx actually collects district as part of onboarding.
// - Certificates Issued: every Application.certificateIssued === true,
//   across every volunteer (same flag the Certificates feature itself uses).
exports.getPublicStats = async (req, res, next) => {
  try {
    const [volunteersCount, treesPlanted, certificatesIssued, districts] = await Promise.all([
      Volunteer.countDocuments({}),
      Application.countDocuments({ track: 'a', status: 'completed' }),
      Application.countDocuments({ certificateIssued: true }),
      Volunteer.distinct('district', { district: { $nin: ['', null] } }),
    ]);

    res.json({
      volunteersCount,
      treesPlanted,
      certificatesIssued,
      districtsCovered: districts.length,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/public/recent-certificate
// Real social proof instead of the mockup's fabricated "Priya S. just
// earned a certificate!" card — the most recently issued certificate,
// system-wide. Only first name + last initial are exposed (never full
// name/email) since this is public and unauthenticated. Returns
// { certificate: null } when nobody has earned one yet — the frontend
// hides the card rather than ever inventing a placeholder person.
exports.getRecentCertificate = async (req, res, next) => {
  try {
    const application = await Application.findOne({ certificateIssued: true })
      .sort({ certificateIssuedAt: -1 })
      .populate('opportunity')
      .populate('volunteer')
      .lean();

    if (!application) return res.json({ certificate: null });

    const v = application.volunteer;
    const firstName = v?.firstName || 'A volunteer';
    const lastInitial = v?.lastName ? ` ${v.lastName.charAt(0)}.` : '';

    res.json({
      certificate: {
        name: `${firstName}${lastInitial}`,
        opportunityTitle: application.opportunity?.title || '',
        issuedAt: application.certificateIssuedAt,
      },
    });
  } catch (err) {
    next(err);
  }
};
