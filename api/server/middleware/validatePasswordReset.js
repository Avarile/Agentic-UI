/**
 * Gates the password-reset flow behind `ALLOW_PASSWORD_RESET`.
 *
 * Attempts while disabled are logged with the source IP — probing a disabled reset endpoint is
 * worth seeing in the logs.
 *
 * Connections: used by `server/routes/auth.js`
 */
const { isEnabled } = require('@librechat/api');
const { logger } = require('@librechat/data-schemas');

function validatePasswordReset(req, res, next) {
  if (isEnabled(process.env.ALLOW_PASSWORD_RESET)) {
    next();
  } else {
    logger.warn(`Password reset attempt while not allowed. IP: ${req.ip}`);
    res.status(403).send('Password reset is not allowed.');
  }
}

module.exports = validatePasswordReset;
