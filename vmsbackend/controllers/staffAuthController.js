
const Manager = require('../models/Manager');
const Admin = require('../models/Admin');
const googleClient = require('../utils/googleClient');
const generateToken = require('../utils/generateToken');
const { toPublicStaff } = require('../views/staffView');

const STAFF_DOMAIN = process.env.STAFF_DOMAIN || 'sankalptaru.org';

// POST /api/auth/staff/google
// body: { credential }  (Google ID token JWT from the <GoogleLogin/> button)
// Managers and admins are NEVER created here — they must already exist in the
// Manager or Admin collection (added by an existing admin, or via the seed
// script). This endpoint only verifies "is this really a Google account on
// our domain, and does it belong to someone we've provisioned as staff".

async function googleLogin(req, res) {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    const email = (payload.email || '').toLowerCase();
    const emailVerified = payload.email_verified;
    const hostedDomain = payload.hd;

    if (!email || !emailVerified) {
      return res.status(401).json({ message: 'Could not verify your Google account.' });
    }

    const isStaffDomain = hostedDomain === STAFF_DOMAIN || email.endsWith(`@${STAFF_DOMAIN}`);
    if (!isStaffDomain) {
      return res.status(403).json({
        message: `Staff login is restricted to @${STAFF_DOMAIN} Google accounts.`,
      });
    }

    // Check Admin first, then Manager.
    let staffDoc = await Admin.findOne({ email });
    let role = 'admin';

    if (!staffDoc) {
      staffDoc = await Manager.findOne({ email });
      role = 'manager';
    }

    if (!staffDoc) {
      return res.status(403).json({
        message: 'No manager or admin account found for this email. Contact IT to be provisioned.',
      });
    }

    if (!staffDoc.isActive) {
      return res.status(403).json({ message: 'This staff account has been deactivated.' });
    }

    if (!staffDoc.googleId) staffDoc.googleId = payload.sub;
    staffDoc.lastLoginAt = new Date();
    await staffDoc.save();

    const token = generateToken({ id: staffDoc._id, role, email: staffDoc.email });
    return res.json({ token, role, user: toPublicStaff(staffDoc, role) });
  } catch (err) {
    console.error('[staffAuth.googleLogin]', err);
    return res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
  }
}

module.exports = { googleLogin };
