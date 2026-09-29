const mongoose = require('mongoose');

const AGE_RANGES = ['under18', '18-24', '25-34', '35-44', '45-60', '60+'];
const GENDERS = ['female', 'male', 'non-binary', 'other', ''];
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'unknown', ''];
const ENGAGEMENTS = ['student', 'professional', 'freelancer', 'homemaker', 'retired', 'other', ''];
const MODES = ['remote', 'field', 'office', 'hybrid', ''];

const volunteerSchema = new mongoose.Schema(
  {
    // --- Account (set at registration) ---
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, select: false }, // absent for Google-only accounts
    googleId: { type: String, index: true, sparse: true },

    role: { type: String, default: 'volunteer', immutable: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },

    // --- Forgot password (OTP) — see controllers/volunteerAuthController.js's
    // forgotPassword/resetPassword. select:false like passwordHash, so a
    // normal find/API response never leaks these. resetOtpHash is a bcrypt
    // hash of the 6-digit code (never the raw code) — same reasoning as
    // passwordHash, defense in depth if the DB itself were ever exposed.
    resetOtpHash: { type: String, select: false },
    resetOtpExpiresAt: { type: Date, select: false },
    resetOtpAttempts: { type: Number, default: 0, select: false },
    // Timestamp of the last OTP request — used only to throttle how often a
    // new code can be requested (see OTP_RESEND_COOLDOWN_MS), not for OTP
    // validity itself (resetOtpExpiresAt handles that).
    resetOtpRequestedAt: { type: Date, select: false },

    // --- Email verification (OTP) — required before an email/password
    // account can log in (see register/verifyEmailOtp/resendVerificationOtp
    // in controllers/volunteerAuthController.js). Google sign-in accounts
    // are auto-verified (see googleLogin) since Google already confirmed
    // the address. Same select:false + bcrypt-hash pattern as the
    // reset-password OTP fields above.
    isEmailVerified: { type: Boolean, default: false },
    emailVerifyOtpHash: { type: String, select: false },
    emailVerifyOtpExpiresAt: { type: Date, select: false },
    emailVerifyOtpAttempts: { type: Number, default: 0, select: false },
    emailVerifyOtpRequestedAt: { type: Date, select: false },

    // --- Step 2: Profile.jsx ---
    firstName: { type: String, trim: true, default: '' },
    lastName: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    ageRange: { type: String, enum: [...AGE_RANGES, ''], default: '' },
    gender: { type: String, enum: GENDERS, default: '' },
    bloodGroup: { type: String, enum: BLOOD_GROUPS, default: '' },

    pincode: { type: String, trim: true, default: '' },
    state: { type: String, trim: true, default: '' },
    district: { type: String, trim: true, default: '' },
    cityTown: { type: String, trim: true, default: '' },

    engagement: { type: String, enum: ENGAGEMENTS, default: '' },

    // photo is stored as a data URL from the frontend's FileReader preview.
    // Fine for a prototype; swap for real object storage (S3/Cloudinary) +
    // just store the resulting URL here before this goes to production.
    photoUrl: { type: String, default: '' },

    // Resume — uploaded via EditProfile.jsx, stored via the same Google
    // Drive OAuth upload flow as Track A photos / Task submission files
    // (see utils/driveUpload.js), just with folder prefix 'resumes'.
    // resumeUrl is the public "anyone with the link" view link shown to the
    // volunteer/staff; resumeKey is the raw Drive file id, kept internal
    // (never sent to the client — see views/volunteerView.js) so
    // geminiMatcher.js can download the actual bytes back from Drive when
    // scoring Track B matches. resumeMimeType gates that: only a PDF is
    // read directly by Gemini today (see geminiMatcher.js's file header).
    resumeUrl: { type: String, default: '' },
    resumeKey: { type: String, default: '' },
    resumeMimeType: { type: String, default: '' },
    resumeFileName: { type: String, default: '' },
    resumeUploadedAt: { type: Date },

    profileCompletedAt: { type: Date },

    // --- Step 3: Skills.jsx ---
    // category id -> array of selected skill names, e.g. { tech: ['Web Development'] }
    selectedSkills: { type: Map, of: [String], default: {} },
    totalSkills: { type: Number, default: 0 },

    availability: {
      weekdays: { type: Boolean, default: false },
      // Only meaningful when weekdays === true — the Skills.jsx time picker
      // only ever shows/edits these two fields for the Weekdays option.
      weekdaysTimeFrom: { type: String, default: '18:00' },
      weekdaysTimeTo: { type: String, default: '20:00' },
      weekends: { type: Boolean, default: false },
      holidays: { type: Boolean, default: false },
      flexible: { type: Boolean, default: false },
    },

    mode: { type: String, enum: MODES, default: '' },
    prefCity: { type: String, trim: true, default: '' },
    languages: { type: String, trim: true, default: '' }, 
    portfolio: { type: String, trim: true, default: '' },
    note: { type: String, trim: true, maxlength: 300, default: '' },

    skillsCompletedAt: { type: Date },

    // Plain bookmark list — Saved.jsx / the bookmark toggle on
    // Opportunities.jsx. See controllers/volunteerSavedController.js.
    savedOpportunities: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity' }],

    // --- Gemini opportunity matching cache ---
    // Recomputing via Gemini on every Dashboard/Opportunities page load would
    // add latency + API cost on every request, so matches are cached here and
    // only recomputed when something that could change them actually changed:
    // the volunteer's own profile/skills, or the set of live Track B
    // opportunities. See utils/geminiMatcher.js's `isCacheStale()` for the
    // signature comparison that decides this at read-time (no cron/queue
    // needed — see controllers/volunteerOpportunityController.js).
    matchCache: {
      computedAt: { type: Date },
      profileSignature: { type: String, default: '' },
      opportunitySignature: { type: String, default: '' },
      // Which engine/model actually produced these scores. Compared against
      // the live GEMINI_MODEL at read-time (see isCacheStale()) so that
      // changing the model — e.g. after a retirement like gemini-2.5-flash's
      // on 2026-08-21 — auto-invalidates old cached scores instead of
      // silently serving stale fallback results forever.
      modelUsed: { type: String, default: '' },
      usedFallback: { type: Boolean, default: false }, // true if Gemini was unavailable and the heuristic scorer was used instead
      matches: [
        {
          _id: false,
          opportunity: { type: mongoose.Schema.Types.ObjectId, ref: 'Opportunity' },
          score: { type: Number, min: 0, max: 100 },
          reasons: { type: [String], default: [] },
        },
      ],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Volunteer', volunteerSchema);
module.exports.AGE_RANGES = AGE_RANGES;
module.exports.GENDERS = GENDERS;
module.exports.BLOOD_GROUPS = BLOOD_GROUPS;
module.exports.ENGAGEMENTS = ENGAGEMENTS;
module.exports.MODES = MODES;
