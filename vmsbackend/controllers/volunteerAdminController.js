const Volunteer = require('../models/Volunteer');
const Application = require('../models/Application');
const Task = require('../models/Task');
const { buildEngagementSummary } = require('../views/engagementView');

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;

/**
 * Volunteers page (Super Admin + Department Heads). Backed by the real
 * Volunteer collection.
 *
 * `certificates` and `hours` used to be hardcoded to 0 (placeholder text
 * said "no Certificate-issuance or Task/hours-logging model exists yet" —
 * both now do):
 *   - certificates: Application.certificateIssued: true, across every
 *     application that volunteer ever made (Track A auto-issued on
 *     submission, or Track B issued when their task is approved — see
 *     adminTaskController.updateTaskStatus).
 *   - hours: sum of Task.contributionHours across that volunteer's Track B
 *     tasks. Only Track B logs hours at all (contributionHours is set the
 *     moment a task is approved — see the same updateTaskStatus branch);
 *     Track A has no time-logging concept in this app, so a volunteer who
 *     has only ever done Track A work genuinely shows 0 hours here — that's
 *     real, not a placeholder.
 * Computed in two batched aggregates over just this page's volunteer ids
 * rather than one query per row, same reasoning as every other admin list
 * here that avoids N+1 queries.
 */

// GET /api/admin/volunteers?search=&district=&engagement=&page=&limit=
exports.listVolunteers = async (req, res, next) => {
  try {
    const { search, district, engagement } = req.query;

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));

    const filter = {};

    if (search && search.trim()) {
      const re = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ firstName: re }, { lastName: re }, { email: re }];
    }
    if (district && district !== 'all') filter.district = district;
    if (engagement && engagement !== 'all') filter.engagement = engagement;

    const [volunteers, total] = await Promise.all([
      Volunteer.find(filter)
        .select('firstName lastName email district engagement isActive createdAt')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Volunteer.countDocuments(filter),
    ]);

    const volunteerIds = volunteers.map((v) => v._id);
    const [certCounts, hourSums] = await Promise.all([
      Application.aggregate([
        { $match: { volunteer: { $in: volunteerIds }, certificateIssued: true } },
        { $group: { _id: '$volunteer', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { volunteer: { $in: volunteerIds }, contributionHours: { $ne: null } } },
        { $group: { _id: '$volunteer', hours: { $sum: '$contributionHours' } } },
      ]),
    ]);
    const certMap = new Map(certCounts.map((c) => [String(c._id), c.count]));
    const hoursMap = new Map(hourSums.map((h) => [String(h._id), h.hours]));

    res.json({
      volunteers: volunteers.map((v) => ({
        id: v._id,
        name: `${v.firstName || ''} ${v.lastName || ''}`.trim() || '(no name yet)',
        email: v.email,
        district: v.district || '',
        engagement: v.engagement || '',
        certificates: certMap.get(String(v._id)) || 0,
        hours: hoursMap.get(String(v._id)) || 0,
        registered: v.createdAt,
        isActive: v.isActive,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/volunteers/districts
// Distinct list of districts actually present in the collection, for the
// filter dropdown — real values instead of a hardcoded guess list.
exports.listVolunteerDistricts = async (req, res, next) => {
  try {
    const districts = await Volunteer.distinct('district', {
      district: { $nin: ['', null] },
    });
    res.json(districts.sort((a, b) => a.localeCompare(b)));
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/volunteers/groups
// Volunteer Groups page — a read-only Country -> State -> District tree
// built from the real `state`/`district` fields on every Volunteer (the
// same address fields Profile.jsx collects at onboarding, and the same
// `district` the Volunteers directory filter and the public landing page's
// "Districts Covered" stat already use — see volunteerAdminController.js's
// listVolunteerDistricts and publicController.js's getPublicStats).
//
// "India" is a fixed top-level label rather than a real aggregated value:
// the Volunteer schema has no `country` field, and every address this app
// collects (pincode/state/district/cityTown) is already India-specific, so
// there is nothing to group there — it's just the tree's root.
//
// A volunteer who hasn't filled in state/district yet (profile incomplete)
// lands under "Unspecified State" / "No district on file" rather than being
// silently dropped, so the counts here always add up to totalVolunteers.
exports.listVolunteerGroups = async (req, res, next) => {
  try {
    const [totalVolunteers, rows] = await Promise.all([
      Volunteer.countDocuments({}),
      Volunteer.aggregate([
        {
          $group: {
            _id: { state: '$state', district: '$district' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const stateMap = new Map();
    for (const row of rows) {
      const stateName = row._id.state && row._id.state.trim() ? row._id.state.trim() : 'Unspecified State';
      const districtName =
        row._id.district && row._id.district.trim() ? row._id.district.trim() : 'No district on file';

      if (!stateMap.has(stateName)) stateMap.set(stateName, { name: stateName, count: 0, districts: [] });
      const stateEntry = stateMap.get(stateName);
      stateEntry.count += row.count;
      stateEntry.districts.push({ name: districtName, count: row.count });
    }

    const states = Array.from(stateMap.values())
      .map((s) => ({ ...s, districts: s.districts.sort((a, b) => b.count - a.count) }))
      .sort((a, b) => {
        // Real states first (by volunteer count, largest first); the
        // "Unspecified State" bucket always sorts last regardless of size.
        if (a.name === 'Unspecified State') return 1;
        if (b.name === 'Unspecified State') return -1;
        return b.count - a.count;
      });

    const statesRepresented = states.filter((s) => s.name !== 'Unspecified State').length;
    const districtsRepresented = new Set(
      rows.filter((r) => r._id.district && r._id.district.trim()).map((r) => r._id.district.trim())
    ).size;

    res.json({
      totalVolunteers,
      statesRepresented,
      districtsRepresented,
      country: { name: 'India', count: totalVolunteers, states },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/volunteers/:id/engagement
// Read-only admin/manager view of a single volunteer's "My Engagement" page
// (level, metrics, activity heatmap, top skills, achievements) — reuses the
// exact same buildEngagementSummary() the volunteer's own
// GET /volunteer/engagement endpoint uses (controllers/volunteerEngagementController.js,
// views/engagementView.js), just pointed at :id instead of req.user.id.
// Nothing volunteer-identifying beyond what the Volunteers directory
// already shows (name/email/district/engagement) is added here.
exports.getVolunteerEngagement = async (req, res, next) => {
  try {
    const volunteer = await Volunteer.findById(req.params.id).select(
      'firstName lastName email district engagement createdAt'
    );
    if (!volunteer) {
      return res.status(404).json({ message: 'Volunteer not found.' });
    }

    const [applications, tasks] = await Promise.all([
      Application.find({ volunteer: volunteer._id }).populate('opportunity').lean(),
      Task.find({ volunteer: volunteer._id }).lean(),
    ]);

    res.json({
      volunteer: {
        id: volunteer._id,
        name: `${volunteer.firstName || ''} ${volunteer.lastName || ''}`.trim() || '(no name yet)',
        email: volunteer.email,
        district: volunteer.district || '',
        engagement: volunteer.engagement || '',
        registered: volunteer.createdAt,
      },
      ...buildEngagementSummary(applications, tasks),
    });
  } catch (err) {
    next(err);
  }
};
