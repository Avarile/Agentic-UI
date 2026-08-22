/**
 * Verifies the second factor and completes login.
 *
 * Accepts either a TOTP code or a backup code alongside the `tempToken` issued by
 * `LoginController`. The temp token is verified against `JWT_SECRET` before any user lookup, so
 * an unsigned or expired token costs nothing.
 *
 * Design: backup codes are accepted here (not only in account settings) because a user who has
 * lost their authenticator must be able to get in. Successful verification is the only path
 * that calls `setAuthTokens` for a 2FA-enabled account.
 *
 * Connections: `server/services/twoFactorService.js`, `services/AuthService.js`;
 * route `POST /api/auth/2fa/verify-temp` (with `setTwoFactorTempUser` + `twoFactorTempLimiter`)
 */
const jwt = require('jsonwebtoken');
const { logger } = require('@librechat/data-schemas');
const {
  verifyTOTP,
  getTOTPSecret,
  verifyBackupCode,
} = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');
const { getUserById } = require('~/models');

/**
 * Verifies the 2FA code during login using a temporary token.
 */
const verify2FAWithTempToken = async (req, res) => {
  try {
    const { tempToken, token, backupCode } = req.body;
    if (!tempToken) {
      return res.status(400).json({ message: 'Missing temporary token' });
    }

    let payload;
    try {
      payload = jwt.verify(tempToken, process.env.JWT_SECRET);
    } catch (err) {
      logger.error('Failed to verify temporary token:', err);
      return res.status(401).json({ message: 'Invalid or expired temporary token' });
    }

    const user = await getUserById(payload.userId, '+totpSecret +backupCodes');
    if (!user || !user.twoFactorEnabled) {
      return res.status(400).json({ message: '2FA is not enabled for this user' });
    }

    const secret = await getTOTPSecret(user.totpSecret);
    let isVerified = false;
    if (token) {
      isVerified = await verifyTOTP(secret, token);
    } else if (backupCode) {
      isVerified = await verifyBackupCode({ user, backupCode });
    }

    if (!isVerified) {
      return res.status(401).json({ message: 'Invalid 2FA code or backup code' });
    }

    const userData = user.toObject ? user.toObject() : { ...user };
    delete userData.__v;
    delete userData.password;
    delete userData.totpSecret;
    delete userData.backupCodes;
    userData.id = user._id.toString();

    const authToken = await setAuthTokens(user._id, res, null, req);
    return res.status(200).json({ token: authToken, user: userData });
  } catch (err) {
    logger.error('[verify2FAWithTempToken]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = { verify2FAWithTempToken };
