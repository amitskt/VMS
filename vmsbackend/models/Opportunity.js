const mongoose = require('mongoose');
const { DEPARTMENTS } = require('./Manager');

// Kept here rather than duplicated as free text — Skills Required and Mode
// are both closed lists in the Create/Edit Opportunity mockup's chip-select
// / dropdown, so they're enums, not arbitrary strings.
//
// Mirrors the volunteer registration skill catalog exactly (vmsfrontend's
// Skill.jsx COMPETENCIES — same category ids/titles/skill names), so a
// Track B task's "Skills Required" is chosen from the very same specific
// skills (e.g. "Video Editing", "Grant Writing") a volunteer picks during
// onboarding (Volunteer.selectedSkills), instead of the old 8 broad
// category-level labels that didn't correspond to anything a volunteer
// actually selected. If Skill.jsx's catalog ever changes, mirror the change
// here too — there's no shared module between the two apps to enforce it
// automatically.
//
// NOTE: opportunities created before this change may still have their
// `skills` array set to the old category labels (e.g. "Design & Creative")
// — those are no longer valid enum values for *new* saves, but existing
// documents aren't migrated by this change and will keep displaying their
// old label as plain text wherever `opportunity.skills` is rendered.
const SKILL_CATEGORIES = [
  { id: 'tech', title: 'Technology', skills: ['Web Development', 'Data Analysis', 'Mobile App Development', 'UI/UX Design', 'Database Management', 'Cybersecurity'] },
  { id: 'comm', title: 'Communication & Writing', skills: ['Content Writing', 'Social Media Management', 'Copywriting', 'Public Speaking', 'Translation / Multilingual'] },
  { id: 'design', title: 'Design & Creative', skills: ['Graphic Design', 'Video Editing', 'Photography', 'Motion Graphics / Animation', 'Illustration'] },
  { id: 'edu', title: 'Education & Training', skills: ['School Teaching', 'Workshop Facilitation', 'Curriculum Design', 'Youth Mentoring'] },
  { id: 'field', title: 'Field & Environment', skills: ['Tree Planting', 'Ecological Survey', 'Nursery Management', 'Environmental Monitoring'] },
  { id: 'mgmt', title: 'Management & Operations', skills: ['Event Planning', 'Volunteer Coordination', 'Project Management', 'Logistics & Supply Chain'] },
  { id: 'fund', title: 'Fundraising & Outreach', skills: ['Crowdfunding Campaigns', 'Grant Writing', 'Corporate Outreach', 'Community Mobilisation'] },
  { id: 'research', title: 'Research & Analysis', skills: ['Scientific Research', 'Policy Analysis', 'Impact Assessment', 'Data Journalism'] },
];

// Flat list of every individual skill name across all categories above —
// this is what opportunity.skills actually validates against and stores
// (same flat-array shape as before; only the values changed).
const SKILLS = SKILL_CATEGORIES.flatMap((c) => c.skills);

const MODES = ['Remote', 'Field-based', 'Hybrid'];

const STATUSES = ['active', 'draft', 'deactivated', 'archived'];

const opportunitySchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    overview: { type: String, required: true, trim: true },
    whatYouWillDo: { type: String, trim: true, default: '' },
    whatYouWillLearn: { type: String, trim: true, default: '' },

    mode: { type: String, enum: MODES, required: true },
    // Numeric now (was free text like "4 weeks" / "3–5 hrs/week") — units
    // are implied and rendered by the frontend (weeks / hrs per week),
    // rather than typed by whoever fills the form. Unset/null = not
    // specified.
    duration: { type: Number, min: 1, default: null }, // weeks
    timeCommitment: { type: Number, min: 0, default: null }, // hrs/week

    // Unset/null = unlimited. Always unlimited for Track A regardless of
    // what's sent — enforced in a pre-save hook below, not just the
    // frontend, since this is a real API now.
    capacity: { type: Number, min: 1, default: null },

    track: { type: String, enum: ['a', 'b'], required: true },

    // Skills Required — mandatory for Track B (the whole point of Track B
    // is that it's skill-matched), optional for Track A (no skill barrier
    // by design, so nothing to require). `this` is the document being
    // validated — needs a real `function`, not an arrow function, to see
    // `this.track`.
    skills: {
      type: [{ type: String, enum: SKILLS }],
      validate: {
        validator: function (arr) {
          if (this.track === 'a') return true;
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'At least one skill is required for Track B.',
      },
    },

    // Owning department(s) — mandatory for Track B, optional for Track A
    // (evergreen opportunities aren't necessarily tied to one department).
    // A manager may only ever have their own single department in this
    // array when it IS set — enforced in the controller (never trust the
    // client for this field when the requester is a manager), not here,
    // since the schema alone can't know who's asking.
    depts: {
      type: [{ type: String, enum: DEPARTMENTS }],
      validate: {
        validator: function (arr) {
          if (this.track === 'a') return true;
          return Array.isArray(arr) && arr.length > 0;
        },
        message: 'At least one owning department is required for Track B.',
      },
    },

    // Related documents (SRS, briefs, reference material, ...) a manager
    // attaches to a Track B opportunity so volunteers can actually
    // understand the project before applying. Uploaded via the same Google
    // Drive OAuth flow as everything else (utils/driveUpload.js) — `key` is
    // the Drive file id (needed to delete it later), `url` is the
    // shareable "anyone with the link can view" link volunteers open.
    documents: [
      {
        url: { type: String, required: true },
        key: { type: String, required: true },
        fileName: { type: String, default: '' },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],

    status: { type: String, enum: STATUSES, default: 'draft' },

    // No Application model exists yet — this is a placeholder counter,
    // same convention as departmentController.js's opportunitiesCount /
    // openApplicationsCount placeholders, until real applications exist.
    // It's only ever incremented by a future Application flow; nothing in
    // this feature writes to it directly except archive's apps===0 guard.
    apps: { type: Number, default: 0 },

    createdByRole: { type: String, enum: ['admin', 'manager'] },
    createdById: { type: mongoose.Schema.Types.ObjectId },
  },
  { timestamps: true }
);

opportunitySchema.pre('save', function (next) {
  if (this.track === 'a') this.capacity = null;
  next();
});

opportunitySchema.statics.SKILLS = SKILLS;
opportunitySchema.statics.SKILL_CATEGORIES = SKILL_CATEGORIES;
opportunitySchema.statics.MODES = MODES;
opportunitySchema.statics.STATUSES = STATUSES;
opportunitySchema.statics.DEPARTMENTS = DEPARTMENTS;

module.exports = mongoose.model('Opportunity', opportunitySchema);
