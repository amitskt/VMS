const Opportunity = require('../models/Opportunity');
const Manager = require('../models/Manager');
const { toPublicOpportunity } = require('../views/opportunityView');
const { uploadBuffer, deleteFile } = require('../utils/driveUpload');

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;

/**
 * Opportunities (Super Admin + Department Heads). This is the real backend
 * behind Opportunities.jsx / CreateEditOpportunity.jsx, replacing the
 * frontend's earlier in-memory mock (opportunitiesData.js).
 *
 * DEPARTMENT SCOPING — the actual business rule, enforced here rather than
 * trusted from the client:
 *   - Super Admin (`req.user.role === 'admin'`): sees and can manage every
 *     opportunity, across all departments, unrestricted.
 *   - Department Head (`req.user.role === 'manager'`): only ever sees
 *     opportunities that include their own department, and can only ever
 *     create/edit opportunities under their own department — this
 *     controller looks up their real department from the Manager
 *     collection via the JWT's `id` (the token itself doesn't carry
 *     department) and ignores/overwrites anything the client sends for
 *     `depts`. A manager can never grant an opportunity to a department
 *     that isn't theirs, no matter what the request body says.
 */

// Resolves the requester's department scope for this request.
// - admin -> null (no scoping — sees/manages everything)
// - manager -> their real department string, looked up server-side
// - manager whose account record is missing -> undefined (caller should 403)
async function resolveScope(req) {
  if (req.user.role !== 'manager') return null;
  const manager = await Manager.findById(req.user.id).select('department');
  return manager ? manager.department : undefined;
}

// GET /api/admin/opportunities/meta
// Reference lists for the Create/Edit form's dropdowns/chip-selects, plus
// the resolved department scope for the current requester — so the
// frontend never has to guess or hardcode a manager's department.
exports.getMeta = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }
    res.json({
      departments: Opportunity.DEPARTMENTS,
      skills: Opportunity.SKILLS,
      // Grouped by category (same grouping as volunteer registration's
      // Skill.jsx) so the Create/Edit form can render Skills Required with
      // the same category headings instead of one flat, 36-option list.
      // `skills` above is kept flat for any other/older consumer.
      skillCategories: Opportunity.SKILL_CATEGORIES,
      modes: Opportunity.MODES,
      myDepartment, // null for admin
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/opportunities?search=&track=&status=&department=&page=&limit=
exports.listOpportunities = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const { search, track, status, department } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));

    const filter = {};

    if (myDepartment) {
      // Manager — always scoped to their own department, regardless of any
      // ?department= the client might send.
      filter.depts = myDepartment;
    } else if (department && department !== 'all') {
      // Admin — free to filter by any department.
      filter.depts = department;
    }

    if (search && search.trim()) {
      filter.title = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    if (track && ['a', 'b'].includes(track)) filter.track = track;
    if (status && Opportunity.STATUSES.includes(status)) filter.status = status;

    const [opportunities, total] = await Promise.all([
      Opportunity.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Opportunity.countDocuments(filter),
    ]);

    res.json({
      opportunities: opportunities.map(toPublicOpportunity),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      myDepartment,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/opportunities/:id
exports.getOpportunity = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return res.status(404).json({ message: 'Opportunity not found.' });

    if (myDepartment && !opp.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This opportunity isn't owned by ${myDepartment}.` });
    }

    res.json({ opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    next(err);
  }
};

// Skills Required and Owning Department are only mandatory for Track B —
// the whole point of Track A ("no skill barrier") is that neither applies.
// A value sent anyway (e.g. an admin who filled them in before switching
// the track toggle to A) is still validated for shape if present, just
// never required.
function validatePayload(body, { myDepartment }) {
  const { title, overview, mode, track, skills, depts, status, duration, timeCommitment } = body;

  if (!title?.trim() || !overview?.trim()) {
    return 'Title and Overview are required.';
  }
  if (!Opportunity.MODES.includes(mode)) {
    return `Mode must be one of: ${Opportunity.MODES.join(', ')}.`;
  }
  if (!['a', 'b'].includes(track)) {
    return "Track must be 'a' or 'b'.";
  }
  if (duration !== '' && duration !== null && duration !== undefined && (isNaN(Number(duration)) || Number(duration) < 1)) {
    return 'Duration must be a whole number of weeks (1 or more).';
  }
  if (timeCommitment !== '' && timeCommitment !== null && timeCommitment !== undefined && (isNaN(Number(timeCommitment)) || Number(timeCommitment) < 0)) {
    return 'Time Commitment must be a number of hours per week (0 or more).';
  }
  if (track === 'b') {
    if (!Array.isArray(skills) || skills.length === 0 || !skills.every((s) => Opportunity.SKILLS.includes(s))) {
      return 'At least one valid skill is required for Track B.';
    }
  } else if (skills !== undefined && (!Array.isArray(skills) || !skills.every((s) => Opportunity.SKILLS.includes(s)))) {
    return 'Skills, if provided, must be valid values.';
  }
  if (status && !['active', 'draft'].includes(status)) {
    return "Status must be 'active' or 'draft' when creating/editing.";
  }
  // Department checks differ for admin vs manager — manager's depts are
  // forced server-side (see callers), so no client-side depts validation
  // applies to them. Admin must supply at least one valid department for
  // Track B; it's optional for Track A.
  if (!myDepartment) {
    if (track === 'b') {
      if (!Array.isArray(depts) || depts.length === 0 || !depts.every((d) => Opportunity.DEPARTMENTS.includes(d))) {
        return 'At least one valid owning department is required for Track B.';
      }
    } else if (depts !== undefined && (!Array.isArray(depts) || !depts.every((d) => Opportunity.DEPARTMENTS.includes(d)))) {
      return 'Owning department(s), if provided, must be valid values.';
    }
  }
  return null;
}

// '' / null / undefined -> null (not specified); otherwise the numeric value.
function toNumberOrNull(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// POST /api/admin/opportunities
exports.createOpportunity = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const error = validatePayload(req.body, { myDepartment });
    if (error) return res.status(400).json({ message: error });

    const { title, overview, whatYouWillDo, whatYouWillLearn, mode, duration, timeCommitment, capacity, track, skills, status } = req.body;

    const opp = await Opportunity.create({
      title: title.trim(),
      overview: overview.trim(),
      whatYouWillDo,
      whatYouWillLearn,
      mode,
      duration: toNumberOrNull(duration),
      timeCommitment: toNumberOrNull(timeCommitment),
      capacity: track === 'b' && capacity ? Number(capacity) : null,
      track,
      // Track A: no skill barrier by design, so this is optional — an
      // empty/omitted list is valid (validatePayload above only requires
      // it for Track B).
      skills: skills || [],
      // Manager: always their own department only, never whatever the
      // client sent. Admin: whatever valid list they submitted, or none at
      // all for Track A (evergreen work isn't necessarily department-owned).
      depts: myDepartment ? [myDepartment] : req.body.depts || [],
      status: status === 'active' ? 'active' : 'draft',
      createdByRole: req.user.role,
      createdById: req.user.id,
    });

    res.status(201).json({ message: 'Opportunity created.', opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

// PUT /api/admin/opportunities/:id
exports.updateOpportunity = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return res.status(404).json({ message: 'Opportunity not found.' });

    if (myDepartment && !opp.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This opportunity isn't owned by ${myDepartment}.` });
    }

    const error = validatePayload(req.body, { myDepartment });
    if (error) return res.status(400).json({ message: error });

    const { title, overview, whatYouWillDo, whatYouWillLearn, mode, duration, timeCommitment, capacity, track, skills, status } = req.body;

    // Track can't change once applications exist — the Create/Edit mockup
    // shows this hint but never actually enforced it; this is the real
    // enforcement.
    if (opp.apps > 0 && track !== opp.track) {
      return res.status(400).json({ message: 'Track cannot be changed once applications exist against this opportunity.' });
    }

    opp.title = title.trim();
    opp.overview = overview.trim();
    opp.whatYouWillDo = whatYouWillDo;
    opp.whatYouWillLearn = whatYouWillLearn;
    opp.mode = mode;
    opp.duration = toNumberOrNull(duration);
    opp.timeCommitment = toNumberOrNull(timeCommitment);
    opp.capacity = track === 'b' && capacity ? Number(capacity) : null;
    opp.track = track;
    opp.skills = skills || [];
    opp.depts = myDepartment ? [myDepartment] : req.body.depts || [];
    opp.status = status === 'active' ? 'active' : 'draft';

    await opp.save();

    res.json({ message: 'Opportunity updated.', opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
};

// PATCH /api/admin/opportunities/:id/toggle-status
// Active <-> Deactivated only (matches the row action in the mockup —
// draft/archived opportunities aren't toggled this way).
exports.toggleOpportunityStatus = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return res.status(404).json({ message: 'Opportunity not found.' });

    if (myDepartment && !opp.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This opportunity isn't owned by ${myDepartment}.` });
    }

    opp.status = opp.status === 'deactivated' ? 'active' : 'deactivated';
    await opp.save();

    res.json({ message: `Opportunity ${opp.status === 'active' ? 'reactivated' : 'deactivated'}.`, opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    next(err);
  }
};

// PATCH /api/admin/opportunities/:id/archive
exports.archiveOpportunity = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const opp = await Opportunity.findById(req.params.id);
    if (!opp) return res.status(404).json({ message: 'Opportunity not found.' });

    if (myDepartment && !opp.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This opportunity isn't owned by ${myDepartment}.` });
    }
    if (opp.apps > 0) {
      return res.status(400).json({ message: 'Resolve open applications before archiving.' });
    }

    opp.status = 'archived';
    await opp.save();

    res.json({ message: 'Opportunity archived.', opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    next(err);
  }
};

// Shared by uploadOpportunityDocuments/deleteOpportunityDocument — same
// "does this exist, does it belong to my department, is it even Track B"
// gate every other per-opportunity endpoint above already applies.
async function loadScopedTrackBOpportunity(req) {
  const myDepartment = await resolveScope(req);
  if (myDepartment === undefined) {
    const err = new Error('Your manager account could not be found.');
    err.status = 403;
    throw err;
  }
  const opp = await Opportunity.findById(req.params.id);
  if (!opp) {
    const err = new Error('Opportunity not found.');
    err.status = 404;
    throw err;
  }
  if (myDepartment && !opp.depts.includes(myDepartment)) {
    const err = new Error(`This opportunity isn't owned by ${myDepartment}.`);
    err.status = 403;
    throw err;
  }
  if (opp.track !== 'b') {
    const err = new Error('Related documents are only available for Track B opportunities.');
    err.status = 400;
    throw err;
  }
  return opp;
}

// POST /api/admin/opportunities/:id/documents
// multipart/form-data, field name 'documents' (up to 5 files per request,
// multer memoryStorage — see middleware/upload.js and
// routes/opportunitiesAdminRoutes.js's upload.array(...) wiring). Lets a
// manager/admin attach SRS docs, briefs, or other reference material so
// volunteers can actually understand the project before applying (see
// OpportunityDetail.jsx's "Related Documents" section). Uploads land on
// the opportunity immediately — independent of the main Save/Publish
// button, same pattern as a volunteer's resume upload on EditProfile.jsx —
// so this only works on an opportunity that already exists (has an :id);
// a brand-new one must be saved at least once first.
exports.uploadOpportunityDocuments = async (req, res, next) => {
  try {
    const opp = await loadScopedTrackBOpportunity(req);

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'Please choose at least one document to upload.' });
    }

    const uploaded = await Promise.all(
      req.files.map((file) => uploadBuffer(file.buffer, file.originalname, file.mimetype, 'opportunity-docs'))
    );
    uploaded.forEach(({ url, key }, i) => {
      opp.documents.push({ url, key, fileName: req.files[i].originalname, uploadedAt: new Date() });
    });
    await opp.save();

    res.json({ message: 'Document(s) uploaded.', opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};

// DELETE /api/admin/opportunities/:id/documents/:docId
exports.deleteOpportunityDocument = async (req, res, next) => {
  try {
    const opp = await loadScopedTrackBOpportunity(req);

    const doc = opp.documents.find((d) => String(d._id) === req.params.docId);
    if (!doc) return res.status(404).json({ message: 'Document not found on this opportunity.' });

    await deleteFile(doc.key);
    opp.documents = opp.documents.filter((d) => String(d._id) !== req.params.docId);
    await opp.save();

    res.json({ message: 'Document removed.', opportunity: toPublicOpportunity(opp) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ message: err.message });
    next(err);
  }
};
