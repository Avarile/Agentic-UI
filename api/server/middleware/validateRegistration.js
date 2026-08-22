/**
 * Gates public sign-up behind `ALLOW_REGISTRATION`, with an invite bypass.
 *
 * `req.invite` (set by `checkInviteUser`) short-circuits the check — an invited user must be
 * able to register on a closed instance. Order matters: `checkInviteUser` must run first.
 *
 * Connections:
 * - paired with `server/middleware/checkInviteUser.js` on `server/routes/auth.js`
 */
const { isEnabled } = require('@librechat/api');

function validateRegistration(req, res, next) {
  if (req.invite) {
    return next();
  }

  if (isEnabled(process.env.ALLOW_REGISTRATION)) {
    next();
  } else {
    return res.status(403).json({
      message: 'Registration is not allowed.',
    });
  }
}

module.exports = validateRegistration;
