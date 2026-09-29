const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Volunteer = require('../models/Volunteer');
const generateToken = require('../utils/generateToken');
const { toPublicVolunteer } = require('../views/volunteerView');
const { sendMail } = require('../utils/mailer');
const { forgotPasswordOtpEmail, emailVerificationOtpEmail } = require('../utils/emailTemplates');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// @sankalptaru.org is the staff domain (see staffAuthController.js) and
// @stplanet.org is a second reserved org domain — neither should be usable
// to create a Volunteer account, to keep the staff and volunteer identity
// spaces separate.
const RESTRICTED_VOLUNTEER_DOMAINS = ['sankalptaru.org', 'stplanet.org'];

function hasRestrictedDomain(email) {
  const domain = (email || '').split('@')[1]?.toLowerCase();
  return RESTRICTED_VOLUNTEER_DOMAINS.includes(domain);
}

const RESTRICTED_DOMAIN_MESSAGE =
  "Volunteer registration isn't available for @sankalptaru.org or @stplanet.org email addresses. Please use a personal email address to sign up as a volunteer.";

// --- OTP (forgot-password AND email verification share these constants) ---
// A code is valid for 10 minutes, at most 5 wrong guesses are allowed before
// it's invalidated (forcing a fresh request), and a new code can't be
// requested more than once every 60 seconds — cheap abuse resistance without
// needing a queue or external rate-limiting service, consistent with how the
// rest of this app avoids extra infra (see utils/driveUpload.js's in-process
// caches for the same "plain Node, no Redis" pattern).
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const PASSWORD_RE = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/;

function generateOtp() {
  // A uniformly random 6-digit code, zero-padded (e.g. "042817") — crypto.
  // randomInt is cryptographically strong, unlike Math.random().
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

// POST /api/auth/volunteer/register
// Creates the account in an UNVERIFIED state and emails a 6-digit code —
// no token is issued yet. The frontend must call /verify-email with the
// code before the volunteer can actually sign in (see login()'s
// requiresVerification check below).
async function register(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (hasRestrictedDomain(email)) {
      return res.status(403).json({ message: RESTRICTED_DOMAIN_MESSAGE });
    }
    if (!PASSWORD_RE.test(password || '')) {
      return res.status(400).json({ message: 'Password needs at least 8 characters, 1 uppercase letter, and 1 number.' });
    }

    const normalizedEmail = email.toLowerCase();
    let volunteer = await Volunteer.findOne({ email: normalizedEmail }).select('+emailVerifyOtpRequestedAt');

    if (volunteer && volunteer.isEmailVerified) {
      return res.status(409).json({ message: 'An account with this email exists.' });
    }

    // An account exists but was never verified — it isn't usable by anyone
    // yet, so treat this as the same signup attempt continuing rather than
    // dead-ending the volunteer in a 409 they can't recover from. This does
    // let a second person "take over" an abandoned unverified signup by
    // re-registering with the same email, but since that account can't be
    // used for anything until the OTP is entered, the worst case is just a
    // fresh code being sent — no existing data or access is at risk.
    if (volunteer && volunteer.emailVerifyOtpRequestedAt) {
      const elapsed = Date.now() - volunteer.emailVerifyOtpRequestedAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSec}s before requesting another code.` });
      }
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp = generateOtp();
    const otpHash = await bcrypt.hash(otp, 10);
    const otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    const otpRequestedAt = new Date();

    if (volunteer) {
      volunteer.passwordHash = passwordHash;
      volunteer.emailVerifyOtpHash = otpHash;
      volunteer.emailVerifyOtpExpiresAt = otpExpiresAt;
      volunteer.emailVerifyOtpAttempts = 0;
      volunteer.emailVerifyOtpRequestedAt = otpRequestedAt;
      await volunteer.save();
    } else {
      // name, phone, ageRange, status, city etc. are collected later, in
      // Profile.jsx / Skills.jsx — not required to create the account.
      volunteer = await Volunteer.create({
        email: normalizedEmail,
        passwordHash,
        emailVerifyOtpHash: otpHash,
        emailVerifyOtpExpiresAt: otpExpiresAt,
        emailVerifyOtpAttempts: 0,
        emailVerifyOtpRequestedAt: otpRequestedAt,
      });
    }

    const { subject, html, text } = emailVerificationOtpEmail({
      volunteerName: volunteer.firstName || 'there',
      otp,
    });
    const result = await sendMail({ to: volunteer.email, subject, html, text });

    // This email IS the primary action here (not a side effect of one that
    // already succeeded) — a silently-unconfigured/failed send must be
    // surfaced, not swallowed, or the volunteer is left waiting on a code
    // that will never arrive (same reasoning as forgotPassword below).
    if (!result.sent) {
      return res.status(500).json({ message: 'Could not send the verification code right now. Please try again in a moment.' });
    }

    return res.status(201).json({
      message: 'A verification code has been sent to your email.',
      email: volunteer.email,
      requiresVerification: true,
    });
  } catch (err) {
    console.error('[volunteerAuth.register]', err);
    return res.status(500).json({ message: 'Could not create account. Please try again.' });
  }
}

// POST /api/auth/volunteer/verify-email
// body: { email, otp }
// Confirms the code sent by register()/resendVerificationOtp(), marks the
// account verified, and issues the same token/response shape register()
// used to return directly — this is the last step that actually unlocks
// the account.
async function verifyEmailOtp(req, res) {
  try {
    const { email, otp } = req.body;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Enter the 6-digit code sent to your email.' });
    }

    const volunteer = await Volunteer.findOne({ email: email.toLowerCase() }).select(
      '+emailVerifyOtpHash +emailVerifyOtpExpiresAt +emailVerifyOtpAttempts'
    );
    if (!volunteer) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }

    if (volunteer.isEmailVerified) {
      // Already verified (e.g. the user double-submitted, or verified in
      // another tab) — let this succeed and log them in rather than
      // erroring, since the outcome they want (a working, signed-in
      // account) is already true.
      const token = generateToken({ id: volunteer._id, role: 'volunteer', email: volunteer.email });
      return res.json({ token, user: toPublicVolunteer(volunteer), isNewUser: false, alreadyVerified: true });
    }

    if (!volunteer.emailVerifyOtpHash || !volunteer.emailVerifyOtpExpiresAt) {
      return res.status(400).json({ message: 'Request a new verification code and try again.' });
    }

    if (volunteer.emailVerifyOtpExpiresAt.getTime() < Date.now()) {
      volunteer.emailVerifyOtpHash = undefined;
      volunteer.emailVerifyOtpExpiresAt = undefined;
      volunteer.emailVerifyOtpAttempts = 0;
      await volunteer.save();
      return res.status(400).json({ message: 'This code has expired. Request a new one.' });
    }

    if (volunteer.emailVerifyOtpAttempts >= OTP_MAX_ATTEMPTS) {
      volunteer.emailVerifyOtpHash = undefined;
      volunteer.emailVerifyOtpExpiresAt = undefined;
      volunteer.emailVerifyOtpAttempts = 0;
      await volunteer.save();
      return res.status(429).json({ message: 'Too many incorrect attempts. Request a new verification code.' });
    }

    const match = await bcrypt.compare(otp, volunteer.emailVerifyOtpHash);
    if (!match) {
      volunteer.emailVerifyOtpAttempts += 1;
      await volunteer.save();
      const remaining = OTP_MAX_ATTEMPTS - volunteer.emailVerifyOtpAttempts;
      return res.status(400).json({
        message: remaining > 0 ? `Incorrect code. ${remaining} attempt(s) left.` : 'Incorrect code. Request a new verification code.',
      });
    }

    volunteer.isEmailVerified = true;
    volunteer.emailVerifyOtpHash = undefined;
    volunteer.emailVerifyOtpExpiresAt = undefined;
    volunteer.emailVerifyOtpAttempts = 0;
    volunteer.emailVerifyOtpRequestedAt = undefined;
    volunteer.lastLoginAt = new Date();
    await volunteer.save();

    const token = generateToken({ id: volunteer._id, role: 'volunteer', email: volunteer.email });
    return res.status(201).json({ token, user: toPublicVolunteer(volunteer), isNewUser: true });
  } catch (err) {
    console.error('[volunteerAuth.verifyEmailOtp]', err);
    return res.status(500).json({ message: 'Could not verify your email. Please try again.' });
  }
}

// POST /api/auth/volunteer/resend-verification
// body: { email }
async function resendVerificationOtp(req, res) {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const volunteer = await Volunteer.findOne({ email: email.toLowerCase() }).select('+emailVerifyOtpRequestedAt');
    if (!volunteer) {
      return res.status(404).json({ message: 'No account found with this email address.' });
    }
    if (volunteer.isEmailVerified) {
      return res.status(400).json({ message: 'This account is already verified. Please log in.' });
    }

    if (volunteer.emailVerifyOtpRequestedAt) {
      const elapsed = Date.now() - volunteer.emailVerifyOtpRequestedAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSec}s before requesting another code.` });
      }
    }

    const otp = generateOtp();
    volunteer.emailVerifyOtpHash = await bcrypt.hash(otp, 10);
    volunteer.emailVerifyOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    volunteer.emailVerifyOtpAttempts = 0;
    volunteer.emailVerifyOtpRequestedAt = new Date();
    await volunteer.save();

    const { subject, html, text } = emailVerificationOtpEmail({
      volunteerName: volunteer.firstName || 'there',
      otp,
    });
    const result = await sendMail({ to: volunteer.email, subject, html, text });
    if (!result.sent) {
      return res.status(500).json({ message: 'Could not send the verification code right now. Please try again in a moment.' });
    }

    return res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    console.error('[volunteerAuth.resendVerificationOtp]', err);
    return res.status(500).json({ message: 'Could not resend the verification code. Please try again.' });
  }
}

// POST /api/auth/volunteer/login
async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Please enter your password.' });
    }

    const volunteer = await Volunteer.findOne({ email: email.toLowerCase() }).select('+passwordHash');
    if (!volunteer || !volunteer.passwordHash) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    const match = await bcrypt.compare(password, volunteer.passwordHash);
    if (!match) {
      return res.status(401).json({ message: 'Incorrect email or password.' });
    }

    if (!volunteer.isEmailVerified) {
      // Correct password, but the account was never confirmed — send them
      // back through the verification step instead of letting them in.
      // requiresVerification/email let the frontend route straight to the
      // OTP screen with the address pre-filled (see Login.jsx).
      return res.status(403).json({
        message: 'Please verify your email address before logging in.',
        requiresVerification: true,
        email: volunteer.email,
      });
    }

    volunteer.lastLoginAt = new Date();
    await volunteer.save();

    const token = generateToken({ id: volunteer._id, role: 'volunteer', email: volunteer.email });
    return res.json({ token, user: toPublicVolunteer(volunteer), isNewUser: false });
  } catch (err) {
    console.error('[volunteerAuth.login]', err);
    return res.status(500).json({ message: 'Could not log you in. Please try again.' });
  }
}

// POST /api/auth/volunteer/google
// body: { access_token }  (implicit-flow Google access token from the frontend button)
async function googleLogin(req, res) {
  try {
    const { access_token: accessToken } = req.body;
    if (!accessToken) {
      return res.status(400).json({ message: 'Missing Google access token.' });
    }

    const infoRes = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!infoRes.ok) {
      return res.status(401).json({ message: 'Google sign-in failed. Please try again.' });
    }
    const profile = await infoRes.json();
    const email = (profile.email || '').toLowerCase();
    if (!email) {
      return res.status(401).json({ message: 'Could not read your Google account email.' });
    }

    let volunteer = await Volunteer.findOne({ email });
    let isNewUser = false;

    if (!volunteer) {
      if (hasRestrictedDomain(email)) {
        return res.status(403).json({ message: RESTRICTED_DOMAIN_MESSAGE });
      }
      volunteer = await Volunteer.create({
        name: profile.name || email.split('@')[0],
        email,
        googleId: profile.sub,
        acceptTerms: true, // implied by continuing with Google on our sign-up screen
        isEmailVerified: true, // Google has already confirmed this address
      });
      isNewUser = true;
    } else if (!volunteer.googleId) {
      volunteer.googleId = profile.sub;
    }

    // Google has already confirmed ownership of this email address, so any
    // account signing in this way — new or existing, previously
    // email/password-unverified or not — is considered verified from here on.
    volunteer.isEmailVerified = true;

    volunteer.lastLoginAt = new Date();
    await volunteer.save();

    const token = generateToken({ id: volunteer._id, role: 'volunteer', email: volunteer.email });
    return res.json({ token, user: toPublicVolunteer(volunteer), isNewUser });
  } catch (err) {
    console.error('[volunteerAuth.googleLogin]', err);
    return res.status(500).json({ message: 'Google sign-in failed. Please try again.' });
  }
}

// POST /api/auth/volunteer/forgot-password
// body: { email }
// Explicitly checks whether an account with this email exists (and reports
// back plainly if not) rather than the more anonymity-preserving "if an
// account exists, a code has been sent" phrasing some apps use — this is a
// small internal volunteer platform, not a high-security consumer product,
// and a clear answer is more useful here than the extra opacity.
async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const volunteer = await Volunteer.findOne({ email: email.toLowerCase() }).select(
      '+passwordHash +resetOtpRequestedAt'
    );
    if (!volunteer) {
      return res.status(404).json({ message: 'No volunteer account found with this email address.' });
    }
    if (!volunteer.passwordHash) {
      // Google-only account — there is no password to reset.
      return res.status(400).json({
        message: 'This account signs in with Google and has no password to reset. Use "Continue with Google" instead.',
      });
    }

    if (volunteer.resetOtpRequestedAt) {
      const elapsed = Date.now() - volunteer.resetOtpRequestedAt.getTime();
      if (elapsed < OTP_RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsed) / 1000);
        return res.status(429).json({ message: `Please wait ${waitSec}s before requesting another code.` });
      }
    }

    const otp = generateOtp();
    volunteer.resetOtpHash = await bcrypt.hash(otp, 10);
    volunteer.resetOtpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
    volunteer.resetOtpAttempts = 0;
    volunteer.resetOtpRequestedAt = new Date();
    await volunteer.save();

    const { subject, html, text } = forgotPasswordOtpEmail({
      volunteerName: volunteer.firstName || 'there',
      otp,
    });
    const result = await sendMail({ to: volunteer.email, subject, html, text });

    // Unlike the fire-and-forget notifications in notifyVolunteer.js, this
    // email IS the primary action here (not a side effect of one that
    // already succeeded) — a silently-unconfigured/failed send must be
    // surfaced, not swallowed, or the volunteer is left waiting on a code
    // that will never arrive.
    if (!result.sent) {
      return res.status(500).json({ message: 'Could not send the verification code right now. Please try again in a moment.' });
    }

    return res.json({ message: 'A verification code has been sent to your email.' });
  } catch (err) {
    console.error('[volunteerAuth.forgotPassword]', err);
    return res.status(500).json({ message: 'Could not process your request. Please try again.' });
  }
}

// POST /api/auth/volunteer/reset-password
// body: { email, otp, newPassword }
async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !EMAIL_RE.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      return res.status(400).json({ message: 'Enter the 6-digit code sent to your email.' });
    }
    if (!PASSWORD_RE.test(newPassword || '')) {
      return res.status(400).json({ message: 'Password needs at least 8 characters, 1 uppercase letter, and 1 number.' });
    }

    const volunteer = await Volunteer.findOne({ email: email.toLowerCase() }).select(
      '+resetOtpHash +resetOtpExpiresAt +resetOtpAttempts'
    );
    if (!volunteer || !volunteer.resetOtpHash || !volunteer.resetOtpExpiresAt) {
      return res.status(400).json({ message: 'Request a new verification code and try again.' });
    }

    if (volunteer.resetOtpExpiresAt.getTime() < Date.now()) {
      volunteer.resetOtpHash = undefined;
      volunteer.resetOtpExpiresAt = undefined;
      volunteer.resetOtpAttempts = 0;
      await volunteer.save();
      return res.status(400).json({ message: 'This code has expired. Request a new one.' });
    }

    if (volunteer.resetOtpAttempts >= OTP_MAX_ATTEMPTS) {
      volunteer.resetOtpHash = undefined;
      volunteer.resetOtpExpiresAt = undefined;
      volunteer.resetOtpAttempts = 0;
      await volunteer.save();
      return res.status(429).json({ message: 'Too many incorrect attempts. Request a new verification code.' });
    }

    const match = await bcrypt.compare(otp, volunteer.resetOtpHash);
    if (!match) {
      volunteer.resetOtpAttempts += 1;
      await volunteer.save();
      const remaining = OTP_MAX_ATTEMPTS - volunteer.resetOtpAttempts;
      return res.status(400).json({
        message: remaining > 0 ? `Incorrect code. ${remaining} attempt(s) left.` : 'Incorrect code. Request a new verification code.',
      });
    }

    volunteer.passwordHash = await bcrypt.hash(newPassword, 10);
    volunteer.resetOtpHash = undefined;
    volunteer.resetOtpExpiresAt = undefined;
    volunteer.resetOtpAttempts = 0;
    volunteer.resetOtpRequestedAt = undefined;
    await volunteer.save();

    return res.json({ message: 'Your password has been reset. You can now log in.' });
  } catch (err) {
    console.error('[volunteerAuth.resetPassword]', err);
    return res.status(500).json({ message: 'Could not reset your password. Please try again.' });
  }
}

module.exports = {
  register,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
  verifyEmailOtp,
  resendVerificationOtp,
};
