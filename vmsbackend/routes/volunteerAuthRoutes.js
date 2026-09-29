const express = require('express');
const {
  register,
  login,
  googleLogin,
  forgotPassword,
  resetPassword,
  verifyEmailOtp,
  resendVerificationOtp,
} = require('../controllers/volunteerAuthController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/verify-email', verifyEmailOtp);
router.post('/resend-verification', resendVerificationOtp);

module.exports = router;
