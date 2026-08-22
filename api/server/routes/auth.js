/**
 * Authentication endpoints: login, logout, registration, password reset, refresh, 2FA.
 *
 * The middleware chains here are the security policy for account access — read them as
 * ordered pipelines:
 * - `/login`: logHeaders -> loginLimiter -> checkBan -> validateEmailLogin -> (LDAP *or*
 *   local strategy) -> setBalanceConfig -> controller. Rate limit and ban precede
 *   authentication so credential stuffing is throttled before any password comparison.
 * - `/register`: registerLimiter -> checkBan -> checkInviteUser -> validateRegistration.
 *   `checkInviteUser` must run before `validateRegistration`, which honours `req.invite` as
 *   the bypass for a closed instance.
 * - `/requestPasswordReset` and `/resetPassword` use *separate* limiters, because the two
 *   steps are abused differently (mail spam vs. token brute force).
 * - `/2fa/verify-temp`: setTwoFactorTempUser -> twoFactorTempLimiter -> checkBan. The temp
 *   user must be resolved first so the limiter can key on the user rather than only the IP.
 *
 * Design: `ldapAuth` is computed once at module load from env, so the login route is bound to
 * exactly one strategy for the process lifetime rather than branching per request.
 * `setBalanceConfig` runs on successful auth so a new or returning user has their balance
 * initialized before the client asks for it.
 *
 * `/cloudfront/refresh` re-signs CloudFront cookies for long sessions, reusing the result
 * already warmed by `requireJwtAuth` when available and returning 404 when the feature is off.
 *
 * Connections:
 * - controllers: `server/controllers/AuthController.js`, `auth/LoginController.js`,
 *   `auth/LogoutController.js`, `TwoFactorController.js`, `auth/TwoFactorAuthController.js`
 * - mounted at `/api/auth` with `preAuthTenantMiddleware` in `server/index.js`
 */
const express = require('express');
const { createSetBalanceConfig, forceRefreshCloudFrontAuthCookies } = require('@librechat/api');
const {
  resetPasswordRequestController,
  resetPasswordController,
  registrationController,
  graphTokenController,
  refreshController,
} = require('~/server/controllers/AuthController');
const {
  regenerateBackupCodes,
  disable2FA,
  confirm2FA,
  enable2FA,
  verify2FA,
} = require('~/server/controllers/TwoFactorController');
const { verify2FAWithTempToken } = require('~/server/controllers/auth/TwoFactorAuthController');
const { logoutController } = require('~/server/controllers/auth/LogoutController');
const { loginController } = require('~/server/controllers/auth/LoginController');
const { findBalanceByUser, upsertBalanceFields } = require('~/models');
const { getAppConfig } = require('~/server/services/Config');
const middleware = require('~/server/middleware');

const setBalanceConfig = createSetBalanceConfig({
  getAppConfig,
  findBalanceByUser,
  upsertBalanceFields,
});

const router = express.Router();
const getCloudFrontAuthCookieRefreshResult = (req, res) => {
  const warmedResult = req.cloudFrontAuthCookieRefreshResult;
  if (warmedResult && (warmedResult.attempted || !warmedResult.enabled)) {
    return warmedResult;
  }

  return forceRefreshCloudFrontAuthCookies(req, res, req.user);
};

const ldapAuth = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;
//Local
router.post('/logout', middleware.requireJwtAuth, logoutController);
router.post(
  '/login',
  middleware.logHeaders,
  middleware.loginLimiter,
  middleware.checkBan,
  middleware.validateEmailLogin,
  ldapAuth ? middleware.requireLdapAuth : middleware.requireLocalAuth,
  setBalanceConfig,
  loginController,
);
router.post('/refresh', refreshController);
router.post('/cloudfront/refresh', middleware.requireJwtAuth, (req, res) => {
  const result = getCloudFrontAuthCookieRefreshResult(req, res);
  if (!result.enabled) {
    return res.sendStatus(404);
  }

  const status = result.refreshed ? 200 : 500;
  return res.status(status).json({
    ok: result.refreshed,
    expiresInSec: result.expiresInSec,
    refreshAfterSec: result.refreshAfterSec,
  });
});
router.post(
  '/register',
  middleware.registerLimiter,
  middleware.checkBan,
  middleware.checkInviteUser,
  middleware.validateRegistration,
  registrationController,
);
router.post(
  '/requestPasswordReset',
  middleware.resetPasswordLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordRequestController,
);
router.post(
  '/resetPassword',
  middleware.resetPasswordSubmissionLimiter,
  middleware.checkBan,
  middleware.validatePasswordReset,
  resetPasswordController,
);

router.post('/2fa/enable', middleware.requireJwtAuth, enable2FA);
router.post('/2fa/verify', middleware.requireJwtAuth, verify2FA);
router.post(
  '/2fa/verify-temp',
  middleware.setTwoFactorTempUser,
  middleware.twoFactorTempLimiter,
  middleware.checkBan,
  verify2FAWithTempToken,
);
router.post('/2fa/confirm', middleware.requireJwtAuth, confirm2FA);
router.post('/2fa/disable', middleware.requireJwtAuth, disable2FA);
router.post('/2fa/backup/regenerate', middleware.requireJwtAuth, regenerateBackupCodes);

router.get('/graph-token', middleware.requireJwtAuth, graphTokenController);

module.exports = router;
