const express = require('express');
const { googleLogin } = require('../controllers/staffAuthController');

const router = express.Router();

// Google-only — there is intentionally no /register route for staff.
router.post('/google', googleLogin);

module.exports = router;
