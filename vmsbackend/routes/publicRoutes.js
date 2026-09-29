const express = require('express');
const {
  listPublicOpportunities,
  getPublicOpportunity,
  getPublicStats,
  getRecentCertificate,
} = require('../controllers/publicController');

const router = express.Router();

// No auth here — this is the public landing page's (Home.jsx) real data
// source. See controllers/publicController.js for exactly what each
// endpoint derives and from what.
router.get('/opportunities', listPublicOpportunities);
router.get('/opportunities/:id', getPublicOpportunity);
router.get('/stats', getPublicStats);
router.get('/recent-certificate', getRecentCertificate);

module.exports = router;
