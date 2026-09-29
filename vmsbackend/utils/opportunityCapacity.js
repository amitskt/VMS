const Application = require('../models/Application');

// Track B opportunities can be capacity-limited (Opportunity.capacity — see
// its model comment; always null for Track A). Once as many volunteers as
// the capacity have actually been shortlisted (or moved further —
// Application.CAPACITY_HOLDING_STATUSES), the opportunity is "full": no new
// volunteer should be able to express interest, and it should read as
// unavailable everywhere a volunteer sees it (Opportunities list, Dashboard
// recommendations, and its own detail page). Deliberately does NOT count
// 'under_review' applications — someone still awaiting a decision hasn't
// taken a slot yet, so other volunteers can still apply while a manager is
// reviewing.
const CAPACITY_HOLDING_STATUSES = Application.CAPACITY_HOLDING_STATUSES;

// One shortlisted-or-further count per opportunity id, for scoring a whole
// list of Track B opportunities without one DB round trip per item.
// Returns a Map keyed by opportunity id (string) -> count.
async function getShortlistedCounts(opportunityIds) {
  if (!opportunityIds || opportunityIds.length === 0) return new Map();
  const rows = await Application.aggregate([
    { $match: { opportunity: { $in: opportunityIds }, status: { $in: CAPACITY_HOLDING_STATUSES } } },
    { $group: { _id: '$opportunity', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

// True once an opportunity has reached its capacity. Always false when
// capacity is null (uncapped, including every Track A opportunity).
function isOpportunityFull(opportunity, shortlistedCount) {
  return opportunity.capacity != null && shortlistedCount >= opportunity.capacity;
}

// Single-opportunity check with its own DB round trip — used where only one
// opportunity is in play (e.g. right before creating a new application) and
// a pre-fetched count map isn't already at hand.
async function isOpportunityFullById(opportunityId, capacity) {
  if (capacity == null) return false;
  const count = await Application.countDocuments({
    opportunity: opportunityId,
    status: { $in: CAPACITY_HOLDING_STATUSES },
  });
  return count >= capacity;
}

module.exports = {
  CAPACITY_HOLDING_STATUSES,
  getShortlistedCounts,
  isOpportunityFull,
  isOpportunityFullById,
};
