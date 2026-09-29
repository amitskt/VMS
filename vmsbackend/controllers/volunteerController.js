const Volunteer = require('../models/Volunteer');
const { toPublicVolunteer } = require('../views/volunteerView');
const { uploadBufferForVolunteer } = require('../utils/driveUpload');

const RESUME_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const REQUIRED_PROFILE_FIELDS = ['firstName', 'lastName', 'phone', 'ageRange', 'pincode', 'cityTown'];

// Decodes a base64 data URL (e.g. 'data:image/jpeg;base64,...') into a
// Buffer + mime type, for uploading a profile photo to Drive the same way
// uploadResume() already uploads a real multipart file — see updateProfile
// below. Returns null for anything that isn't a recognizable image data
// URL (an already-Drive-hosted https:// URL the frontend re-submitted
// unchanged, for instance), so that case is left untouched rather than
// failing the whole profile save over it.
function decodeImageDataUrl(dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|webp));base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
}

// Maps the flat { weekdays, weekends, holidays, flexible } + separate
// timeFrom/timeTo that the frontend sends into the nested availability
// shape on the model — weekdaysTimeFrom/weekdaysTimeTo only ever apply
// when weekdays is true, so they live under availability, not the volunteer.
function applyAvailability(volunteer, availability, timeFrom, timeTo) {
  if (!volunteer.availability) {
    volunteer.availability = {};
  }
  if (availability) {
    volunteer.availability.weekdays = !!availability.weekdays;
    volunteer.availability.weekends = !!availability.weekends;
    volunteer.availability.holidays = !!availability.holidays;
    volunteer.availability.flexible = !!availability.flexible;
  }
  // Only store/keep a time range when weekdays is actually selected.
  if (volunteer.availability.weekdays) {
    if (timeFrom) volunteer.availability.weekdaysTimeFrom = timeFrom;
    if (timeTo) volunteer.availability.weekdaysTimeTo = timeTo;
  } else {
    volunteer.availability.weekdaysTimeFrom = undefined;
    volunteer.availability.weekdaysTimeTo = undefined;
  }
  volunteer.markModified('availability');
}

// GET /api/volunteer/profile
// Lets Profile.jsx / Skills.jsx pre-fill fields if the volunteer comes back later.
async function getProfile(req, res) {
  try {
    const volunteer = await Volunteer.findById(req.user.id);
    if (!volunteer) {
      return res.status(404).json({ message: 'Volunteer not found.' });
    }
    return res.json({ user: toPublicVolunteer(volunteer) });
  } catch (err) {
    console.error('[volunteer.getProfile]', err);
    return res.status(500).json({ message: 'Could not load your profile.' });
  }
}

// PATCH /api/volunteer/profile
// Body shape matches exactly what Profile.jsx's validateAndContinue builds.
async function updateProfile(req, res) {
  try {
    const {
      firstName, lastName, phone, ageRange, gender, bloodGroup,
      pincode, state, district, cityTown,
      engagement, availability, timeFrom, timeTo,
      photoPreview, // base64 data URL from the frontend's photo picker
    } = req.body;

    const missing = REQUIRED_PROFILE_FIELDS.filter((f) => !String(req.body[f] || '').trim());
    if (missing.length) {
      return res.status(400).json({ message: `Missing required field(s): ${missing.join(', ')}` });
    }

    const volunteer = await Volunteer.findById(req.user.id);
    if (!volunteer) {
      return res.status(404).json({ message: 'Volunteer not found.' });
    }

    volunteer.firstName = firstName;
    volunteer.lastName = lastName;
    volunteer.phone = phone;
    volunteer.ageRange = ageRange;
    volunteer.gender = gender || '';
    volunteer.bloodGroup = bloodGroup || '';
    volunteer.pincode = pincode;
    volunteer.state = state || '';
    volunteer.district = district || '';
    volunteer.cityTown = cityTown;
    volunteer.engagement = engagement || '';

    applyAvailability(volunteer, availability, timeFrom, timeTo);

    // A freshly-picked photo arrives as a base64 data URL (Profile.jsx's
    // photo picker reads the file client-side, same pattern the
    // certificate template upload uses) — uploaded to the volunteer's own
    // Drive subfolder here and replaced with the resulting Drive link, so
    // photoUrl never grows the Volunteer document with embedded image
    // bytes. If it's already a Drive URL (the volunteer re-saved their
    // profile without picking a new photo — Profile.jsx re-sends whatever
    // photoUrl it already had) or decoding fails for any reason, it's
    // stored as-is rather than failing the whole profile save over a photo
    // re-upload that was never actually requested.
    if (photoPreview) {
      const decoded = decodeImageDataUrl(photoPreview);
      if (decoded) {
        try {
          const { url } = await uploadBufferForVolunteer(
            decoded.buffer,
            `photo.${decoded.mimeType.split('/')[1]}`,
            decoded.mimeType,
            'photo',
            volunteer.email
          );
          volunteer.photoUrl = url;
        } catch (err) {
          console.error('[volunteer.updateProfile] photo upload to Drive failed:', err.message);
          volunteer.photoUrl = photoPreview;
        }
      } else {
        volunteer.photoUrl = photoPreview;
      }
    }

    volunteer.profileCompletedAt = new Date();
    await volunteer.save();

    return res.json({ user: toPublicVolunteer(volunteer) });
  } catch (err) {
    console.error('[volunteer.updateProfile]', err);
    return res.status(500).json({ message: 'Could not save your profile. Please try again.' });
  }
}

// PATCH /api/volunteer/skills
// Body shape matches exactly what Skills.jsx's handleFinish sends via onContinue.
async function updateSkills(req, res) {
  try {
    const {
      selectedSkills, totalSkills, availability,
      timeFrom, timeTo, mode, prefCity, langs, portfolio, note,
    } = req.body;

    const volunteer = await Volunteer.findById(req.user.id);
    if (!volunteer) {
      return res.status(404).json({ message: 'Volunteer not found.' });
    }

    if (selectedSkills && typeof selectedSkills === 'object') {
      volunteer.selectedSkills = new Map(Object.entries(selectedSkills));
    }
    volunteer.totalSkills = Number(totalSkills) || 0;
    applyAvailability(volunteer, availability, timeFrom, timeTo);
    volunteer.mode = mode || '';
    volunteer.prefCity = prefCity || '';
    volunteer.languages = langs || '';
    volunteer.portfolio = portfolio || '';
    volunteer.note = (note || '').slice(0, 300);

    volunteer.skillsCompletedAt = new Date();
    await volunteer.save();

    return res.json({ user: toPublicVolunteer(volunteer) });
  } catch (err) {
    console.error('[volunteer.updateSkills]', err);
    return res.status(500).json({ message: 'Could not save your skills & interests. Please try again.' });
  }
}

// POST /api/volunteer/profile/resume
// multipart/form-data, field name 'resume' (multer memoryStorage, 15MB cap —
// see middleware/upload.js). Uploads straight to Drive and saves the
// resulting link on the volunteer doc immediately, independent of the main
// Update Profile save on EditProfile.jsx — so picking a new resume there
// persists right away even if the volunteer never clicks Update Profile.
async function uploadResume(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a resume file to upload.' });
    }
    if (!RESUME_MIME_TYPES.includes(req.file.mimetype)) {
      return res.status(400).json({ message: 'Resume must be a PDF or Word document (.pdf, .doc, .docx).' });
    }

    const volunteer = await Volunteer.findById(req.user.id);
    if (!volunteer) {
      return res.status(404).json({ message: 'Volunteer not found.' });
    }

    const { url, key } = await uploadBufferForVolunteer(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'resume',
      volunteer.email
    );

    volunteer.resumeUrl = url;
    volunteer.resumeKey = key;
    volunteer.resumeMimeType = req.file.mimetype;
    volunteer.resumeFileName = req.file.originalname;
    volunteer.resumeUploadedAt = new Date();
    await volunteer.save();

    return res.json({ user: toPublicVolunteer(volunteer) });
  } catch (err) {
    console.error('[volunteer.uploadResume]', err);
    return res.status(err.status || 500).json({ message: err.message || 'Could not upload your resume. Please try again.' });
  }
}

module.exports = { getProfile, updateProfile, updateSkills, uploadResume };
