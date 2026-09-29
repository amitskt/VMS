const express = require('express');
const { protect, requireRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');
const { getProfile, updateProfile, updateSkills, uploadResume } = require('../controllers/volunteerController');
const {
  getMeta,
  getRecommendedOpportunities,
  listOpportunities,
  getOpportunityDetail,
} = require('../controllers/volunteerOpportunityController');
const {
  createApplication,
  listMyApplications,
  getMyApplication,
  withdrawApplication,
  submitTrackA,
} = require('../controllers/volunteerApplicationController');
const { listSaved, addSaved, removeSaved } = require('../controllers/volunteerSavedController');
const { listMyTasks, submitTask, addComment: addTaskComment } = require('../controllers/volunteerTaskController');
const { listMyCertificates, downloadCertificatePdf } = require('../controllers/volunteerCertificateController');
const { getMyEngagement } = require('../controllers/volunteerEngagementController');

const router = express.Router();

// All routes here require a logged-in volunteer (JWT from /api/auth/volunteer/*).
router.use(protect, requireRole('volunteer'));

router.get('/profile', getProfile);
router.patch('/profile', updateProfile);   // Profile.jsx  -> validateAndContinue
router.patch('/skills', updateSkills);     // Skills.jsx   -> handleFinish
router.post('/profile/resume', upload.single('resume'), uploadResume); // EditProfile.jsx resume upload/replace

// NOTE: /meta and /recommended must be registered before /:id below, or
// Express would try to treat "meta"/"recommended" as an :id — same lesson
// as opportunitiesAdminRoutes.js on the staff side.
router.get('/opportunities/meta', getMeta);                             // Opportunities.jsx filter dropdowns (real skills/modes)
router.get('/opportunities/recommended', getRecommendedOpportunities);  // Dashboard.jsx "Recommended For You" preview
router.get('/opportunities', listOpportunities);                        // Opportunities.jsx full list — search/filter/sort/paginate
router.get('/opportunities/:id', getOpportunityDetail);                 // OpportunityDetail.jsx

// Applications — Claim (Track A) / Express Interest (Track B) / My Applications.
router.post('/applications', createApplication);                 // ClaimTrackA.jsx / ApplyTrackB.jsx submit
router.get('/applications', listMyApplications);                 // MyApplications.jsx list
router.get('/applications/:id', getMyApplication);                // Confirmation.jsx lookup
router.patch('/applications/:id/withdraw', withdrawApplication);  // MyApplications.jsx withdraw
router.post('/applications/:id/submit', upload.single('photo'), submitTrackA); // MyApplications.jsx / MyTasks.jsx Track A photo-or-link submit

// Saved opportunities.
router.get('/saved', listSaved);
router.post('/saved/:opportunityId', addSaved);
router.delete('/saved/:opportunityId', removeSaved);

// My Tasks — Track A claimed applications (read straight from Application,
// no separate Task doc) + Track B tasks a manager has actually assigned
// (see volunteerTaskController.js's file header for why the two halves read
// from different sources).
router.get('/tasks', listMyTasks);
router.post('/tasks/:id/submit', upload.single('file'), submitTask);
router.post('/tasks/:id/comments', addTaskComment);

// My Certificates — earned (Application.certificateIssued) + pending
// (Track B tasks submitted, awaiting approval). See
// volunteerCertificateController.js's file header for the exact rules.
router.get('/certificates', listMyCertificates);
router.get('/certificates/:id/pdf', downloadCertificatePdf);

// My Engagement — level/hours/heatmap/skills/achievements, all recomputed
// live from real Applications + Tasks. See volunteerEngagementController.js.
router.get('/engagement', getMyEngagement);

module.exports = router;
