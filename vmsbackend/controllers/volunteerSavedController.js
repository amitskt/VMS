const Volunteer = require('../models/Volunteer');
const Opportunity = require('../models/Opportunity');
const { toPublicOpportunity } = require('../views/opportunityView');

// GET /api/volunteer/saved
exports.listSaved = async (req, res, next) => {
  try {
    const volunteer = await Volunteer.findById(req.user.id);
    if (!volunteer) return res.status(404).json({ message: 'Volunteer not found.' });

    const opportunities = await Opportunity.find({ _id: { $in: volunteer.savedOpportunities } });
    const scoreById = new Map(
      (volunteer.matchCache?.matches || []).map((m) => [String(m.opportunity), m])
    );

    const saved = opportunities.map((o) => {
      const isEvergreen = o.track === 'a';
      const match = scoreById.get(String(o._id));
      return {
        ...toPublicOpportunity(o),
        isEvergreen,
        isActive: o.status === 'active',
        matchScore: isEvergreen ? null : match?.score ?? null,
        matchReasons: isEvergreen ? [] : match?.reasons || [],
      };
    });

    res.json({ saved });
  } catch (err) {
    next(err);
  }
};

// POST /api/volunteer/saved/:opportunityId
exports.addSaved = async (req, res, next) => {
  try {
    const opportunity = await Opportunity.findById(req.params.opportunityId);
    if (!opportunity) return res.status(404).json({ message: 'Opportunity not found.' });

    await Volunteer.updateOne(
      { _id: req.user.id },
      { $addToSet: { savedOpportunities: opportunity._id } }
    );
    res.json({ message: 'Saved.', saved: true });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/volunteer/saved/:opportunityId
exports.removeSaved = async (req, res, next) => {
  try {
    await Volunteer.updateOne(
      { _id: req.user.id },
      { $pull: { savedOpportunities: req.params.opportunityId } }
    );
    res.json({ message: 'Removed from saved.', saved: false });
  } catch (err) {
    next(err);
  }
};
