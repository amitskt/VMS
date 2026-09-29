const Admin = require('../models/Admin');
const Manager = require('../models/Manager');
const Volunteer = require('../models/Volunteer');

// The JWT payload only carries { id, role, email } (see utils/generateToken.js)
// — no display name — so a Task comment's "who said this" needs one extra
// lookup. Comments are added rarely (not a hot path), so this small extra
// query per call is a fine trade for not stuffing the JWT with more claims.
async function resolveActorName(req) {
  const { id, role, email } = req.user;
  try {
    if (role === 'admin') {
      const doc = await Admin.findById(id).select('name');
      return doc?.name || 'Admin';
    }
    if (role === 'manager') {
      const doc = await Manager.findById(id).select('name');
      return doc?.name || 'Department Head';
    }
    if (role === 'volunteer') {
      const doc = await Volunteer.findById(id).select('firstName lastName');
      const name = `${doc?.firstName || ''} ${doc?.lastName || ''}`.trim();
      return name || 'Volunteer';
    }
  } catch {
    // fall through to the email fallback below
  }
  return email || 'Someone';
}

module.exports = { resolveActorName };
