/**
 * Current-user endpoints: profile, terms acceptance, plugin settings, deletion, email verification.
 *
 * Mounts `server/routes/settings.js` at `/settings`.
 *
 * Design: `/delete` chains `requireJwtAuth -> canDeleteAccount -> configMiddleware` — the
 * policy gate runs before config resolution so a forbidden deletion does no extra work.
 * The email-verification routes are intentionally *unauthenticated* (the user cannot log in
 * until verified) and therefore carry their own limiters:
 * `verifyEmailSubmissionLimiter` on submit, `verifyEmailLimiter` on resend.
 *
 * Connections: controller `server/controllers/UserController.js`
 */
const express = require('express');
const {
  updateUserPluginsController,
  resendVerificationController,
  getTermsStatusController,
  acceptTermsController,
  verifyEmailController,
  deleteUserController,
  getUserController,
} = require('~/server/controllers/UserController');
const {
  verifyEmailLimiter,
  verifyEmailSubmissionLimiter,
  configMiddleware,
  canDeleteAccount,
  requireJwtAuth,
} = require('~/server/middleware');

const settings = require('./settings');

const router = express.Router();

router.use('/settings', settings);
router.get('/', requireJwtAuth, getUserController);
router.get('/terms', requireJwtAuth, getTermsStatusController);
router.post('/terms/accept', requireJwtAuth, acceptTermsController);
router.post('/plugins', requireJwtAuth, updateUserPluginsController);
router.delete('/delete', requireJwtAuth, canDeleteAccount, configMiddleware, deleteUserController);
router.post('/verify', verifyEmailSubmissionLimiter, verifyEmailController);
router.post('/verify/resend', verifyEmailLimiter, resendVerificationController);

module.exports = router;
