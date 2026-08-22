/**
 * Populates `req.user` from a short-lived 2FA `tempToken` during the second login factor.
 *
 * Design: between password verification and TOTP verification the user is authenticated but
 * not yet *logged in*, so there is no session or access token — only a temp token. This
 * middleware bridges that gap so the 2FA endpoints can identify the user with the normal
 * `req.user.id` convention.
 *
 * It is deliberately non-failing: if a real user is already attached, or the token is
 * missing/invalid, it calls `next()` and lets the route's own checks reject. Its only job is
 * to *offer* an identity, never to grant access.
 *
 * Connections:
 * - used by `server/routes/auth.js` with `server/controllers/auth/TwoFactorAuthController.js`
 * - paired with `server/middleware/limiters/twoFactorTempLimiter.js`
 */
const jwt = require('jsonwebtoken');

const setTwoFactorTempUser = (req, _res, next) => {
  if (req.user?.id || req.user?._id) {
    return next();
  }

  const { tempToken } = req.body ?? {};
  if (!tempToken) {
    return next();
  }

  try {
    const payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    if (payload?.userId) {
      req.user = { id: payload.userId };
    }
  } catch {
    return next();
  }

  return next();
};

module.exports = setTwoFactorTempUser;
