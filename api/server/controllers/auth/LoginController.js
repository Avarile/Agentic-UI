/**
 * Completes a successful local/LDAP login.
 *
 * Design: if `twoFactorEnabled`, it returns `{ twoFAPending: true, tempToken }` with status 200
 * and issues **no** auth tokens — the user is authenticated but not yet logged in. Only
 * `TwoFactorAuthController` can convert that temp token into a session. Otherwise it strips
 * `password`, `totpSecret` and `__v` from the user document before responding and sets the auth
 * cookies via `setAuthTokens`.
 *
 * Connections:
 * - `server/services/AuthService.js`, `services/twoFactorService.js`
 * - reached via `requireLocalAuth`/`requireLdapAuth` on `server/routes/auth.js`
 */
const { logger } = require('@librechat/data-schemas');
const { generate2FATempToken } = require('~/server/services/twoFactorService');
const { setAuthTokens } = require('~/server/services/AuthService');

const loginController = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (req.user.twoFactorEnabled) {
      const tempToken = generate2FATempToken(req.user._id);
      return res.status(200).json({ twoFAPending: true, tempToken });
    }

    const { password: _p, totpSecret: _t, __v, ...user } = req.user;
    user.id = user._id.toString();

    const token = await setAuthTokens(req.user._id, res, null, req);

    return res.status(200).send({ token, user });
  } catch (err) {
    logger.error('[loginController]', err);
    return res.status(500).json({ message: 'Something went wrong' });
  }
};

module.exports = {
  loginController,
};
