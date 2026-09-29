const express = require('express');
const router = express.Router();
const { protect, requireRole } = require('../middleware/authMiddleware');
const upload = require('../middleware/upload');

const opportunityController = require('../controllers/opportunityController');

// Opportunities is visible to both Super Admin and Department Heads (same
// broader gate as volunteersAdminRoutes.js) — the finer-grained department
// scoping (a manager only sees/manages their own department's
// opportunities) happens inside opportunityController.js itself, not here.
router.use(protect, requireRole('admin', 'manager'));

// NOTE: /meta must be registered before /:id-style routes below, or Express
// would try to treat "meta" as an :id.
router.get('/opportunities/meta', opportunityController.getMeta);
router.get('/opportunities', opportunityController.listOpportunities);
router.get('/opportunities/:id', opportunityController.getOpportunity);
router.post('/opportunities', opportunityController.createOpportunity);
router.put('/opportunities/:id', opportunityController.updateOpportunity);
router.patch('/opportunities/:id/toggle-status', opportunityController.toggleOpportunityStatus);
router.patch('/opportunities/:id/archive', opportunityController.archiveOpportunity);

// Related documents (Track B only — enforced in the controller, not here).
// Up to 5 files per upload request; CreateEditOpportunity.jsx uploads one
// batch at a time from its Related Documents section.
router.post('/opportunities/:id/documents', upload.array('documents', 5), opportunityController.uploadOpportunityDocuments);
router.delete('/opportunities/:id/documents/:docId', opportunityController.deleteOpportunityDocument);

module.exports = router;
