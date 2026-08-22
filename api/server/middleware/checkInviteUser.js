/**
 * Validates and consumes a registration invite token.
 *
 * Design: the token is optional — with none present the middleware calls `next()` and lets
 * `validateRegistration` decide whether open registration is allowed. When a token *is*
 * present it is validated, deleted (single use), and the invite attached as `req.invite`,
 * which is precisely the flag `validateRegistration` looks for to bypass the
 * `ALLOW_REGISTRATION` gate.
 *
 * Deleting before completing registration is intentional: a replayable invite is worse than a
 * lost one.
 *
 * Connections:
 * - token store via `~/models`; `getInvite` from `packages/api`
 * - runs before `server/middleware/validateRegistration.js` on `server/routes/auth.js`
 */
const { getInvite: getInviteFn } = require('@librechat/api');
const { createToken, findToken, deleteTokens } = require('~/models');

const getInvite = (encodedToken, email) =>
  getInviteFn(encodedToken, email, { createToken, findToken });

async function checkInviteUser(req, res, next) {
  const token = req.body.token;

  if (!token || token === 'undefined') {
    next();
    return;
  }

  try {
    const invite = await getInvite(token, req.body.email);

    if (!invite || invite.error === true) {
      return res.status(400).json({ message: 'Invalid invite token' });
    }

    await deleteTokens({ token: invite.token });
    req.invite = invite;
    next();
  } catch (error) {
    return res.status(429).json({ message: error.message });
  }
}

module.exports = checkInviteUser;
