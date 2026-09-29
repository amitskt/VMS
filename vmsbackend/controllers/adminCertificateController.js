const Application = require('../models/Application');
const Opportunity = require('../models/Opportunity');
const Manager = require('../models/Manager');
const { toPublicCertificate } = require('../views/certificateView');
const { streamCertificatePdf } = require('../utils/certificatePdf');
const { buildCertificateData } = require('../utils/certificateData');

const PAGE_SIZE_DEFAULT = 10;
const PAGE_SIZE_MAX = 100;

/**
 * Certificates log (Super Admin + Department Heads) — converted from
 * admin-10-certificates.html. There is no separate Certificate model: a
 * "certificate" is just an Application with certificateIssued: true (see
 * certificateView.js's header comment for exactly when that happens for
 * each track). This is a read-only log of those, plus the real PDF
 * download the mockup's button didn't actually have behind it.
 *
 * Same department-scoping convention as every other admin controller here:
 * a manager only ever sees certificates for opportunities their own
 * department owns, resolved server-side from the Manager collection.
 *
 * Dropped from the mockup: the "Type" filter's fictional categories
 * (Campaign Participation, Field Volunteering, Special Recognition) —
 * nothing in this app issues those; a certificate's `type` is always
 * exactly "Track A Completion" or "Track B Completion", i.e. 1:1 with
 * track, so a separate Type filter would just duplicate the Track filter.
 */

async function resolveScope(req) {
  if (req.user.role !== 'manager') return null;
  const manager = await Manager.findById(req.user.id).select('department');
  return manager ? manager.department : undefined;
}

// GET /api/admin/certificates/meta
exports.getMeta = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }
    res.json({ departments: Opportunity.DEPARTMENTS, myDepartment });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/certificates?search=&track=&department=&page=&limit=
exports.listCertificates = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const oppFilter = {};
    if (myDepartment) oppFilter.depts = myDepartment;
    else if (req.query.department && req.query.department !== 'all') oppFilter.depts = req.query.department;
    const scopedOpportunityIds = await Opportunity.find(oppFilter).distinct('_id');

    const appFilter = { certificateIssued: true, opportunity: { $in: scopedOpportunityIds } };
    const { track } = req.query;
    if (track === 'a' || track === 'b') appFilter.track = track;

    let applications = await Application.find(appFilter)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName email')
      .sort({ certificateIssuedAt: -1 });

    applications = applications.filter((a) => a.opportunity && a.volunteer);

    let certificates = applications.map((a) => toPublicCertificate(a, a.opportunity, a.volunteer));

    // Search spans volunteer name, opportunity title, and the (derived)
    // certificate ID — same in-memory-after-scoped-fetch approach as
    // adminApplicationController.listApplications, for the same reason
    // (neither is denormalized onto Application).
    const search = (req.query.search || '').trim().toLowerCase();
    if (search) {
      certificates = certificates.filter(
        (c) =>
          c.volunteerName.toLowerCase().includes(search) ||
          c.opportunityTitle.toLowerCase().includes(search) ||
          c.certificateId.toLowerCase().includes(search)
      );
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(req.query.limit, 10) || PAGE_SIZE_DEFAULT));
    const total = certificates.length;
    const pageItems = certificates.slice((page - 1) * limit, page * limit);

    res.json({
      certificates: pageItems,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      myDepartment,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/admin/certificates/:id/pdf   — :id is the real Application _id,
// same convention as every other admin route's :id in this codebase (the
// certificateId shown to people is a cosmetic display string, never a
// lookup key — see certificateView.js).
exports.downloadCertificatePdf = async (req, res, next) => {
  try {
    const myDepartment = await resolveScope(req);
    if (myDepartment === undefined) {
      return res.status(403).json({ message: 'Your manager account could not be found.' });
    }

    const application = await Application.findById(req.params.id)
      .populate('opportunity')
      .populate('volunteer', 'firstName lastName');
    if (!application || !application.opportunity || !application.volunteer || !application.certificateIssued) {
      return res.status(404).json({ message: 'Certificate not found.' });
    }
    if (myDepartment && !application.opportunity.depts.includes(myDepartment)) {
      return res.status(403).json({ message: `This certificate isn't owned by ${myDepartment}.` });
    }

    const cert = await buildCertificateData(application, application.opportunity, application.volunteer);
    streamCertificatePdf(res, cert);
  } catch (err) {
    next(err);
  }
};
