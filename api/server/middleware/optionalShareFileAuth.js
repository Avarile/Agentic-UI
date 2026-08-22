/**
 * Resolves a viewer identity for files served through public share links.
 *
 * Design: a shared conversation may embed files, and the viewer may or may not be logged in.
 * This middleware attempts to identify them from a refresh-token cookie (verified against
 * `JWT_REFRESH_SECRET` *and* confirmed against a live session row — a valid signature alone is
 * not enough, the session must still exist) or from OpenID session tokens when token reuse is
 * enabled. If neither resolves, the request proceeds anonymously and the share ACL decides.
 *
 * The session lookup runs under `runAsSystem` because it must read across tenant scope before
 * a tenant context exists for this request.
 *
 * Connections:
 * - used by the share/file routes (`server/routes/share.js`, `server/routes/files/*`)
 * - related: `server/middleware/canAccessSharedLink.js`, `checkSharePublicAccess.js`
 */
const cookie = require('cookie');
const jwt = require('jsonwebtoken');
const { isEnabled } = require('@librechat/api');
const { logger, runAsSystem } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { getUserById, findSession } = require('~/models');

const verifySignedUserId = (token) => {
  try {
    const payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    return typeof payload?.id === 'string' ? payload.id : null;
  } catch {
    return null;
  }
};

const getRefreshTokenUserId = async (token) => {
  const userId = verifySignedUserId(token);
  if (!userId) {
    return null;
  }

  const session = await runAsSystem(() => findSession({ userId, refreshToken: token }));
  return session ? userId : null;
};

const getOpenIdUserId = (parsed, req) => {
  if (parsed.token_provider !== 'openid' || !isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return null;
  }

  const sessionRefreshToken = req.session?.openidTokens?.refreshToken;
  if (!parsed.refreshToken || parsed.refreshToken !== sessionRefreshToken) {
    return null;
  }

  return verifySignedUserId(parsed.openid_user_id);
};

/**
 * Fallback auth for share file routes that are hit by `<img>`/anchor requests,
 * which can't carry the bearer access token. Resolves the viewer from the
 * `refreshToken` cookie (or an active OpenID session plus signed `openid_user_id`
 * cookie) so non-public shared links can authorize the viewer's ACL. Never
 * blocks: on any failure it leaves `req.user` unset and lets
 * `canAccessSharedLink` decide (public access, 401, or 403).
 */
const optionalShareFileAuth = async (req, res, next) => {
  if (req.user) {
    return next();
  }

  try {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) {
      return next();
    }

    const parsed = cookie.parse(cookieHeader);
    const userId =
      getOpenIdUserId(parsed, req) ||
      (parsed.refreshToken ? await getRefreshTokenUserId(parsed.refreshToken) : null);
    if (!userId) {
      return next();
    }

    // Resolve in system context: this runs before canAccessSharedLink establishes
    // the share tenant, so under strict tenant isolation a tenant-scoped User
    // query would otherwise throw. The viewer's id comes from verified, active
    // cookie auth; the share's tenant-scoped ACL check still gates access.
    const user = await runAsSystem(() =>
      getUserById(userId, '-password -__v -totpSecret -backupCodes'),
    );
    if (user) {
      user.id = user._id.toString();
      if (!user.role) {
        user.role = SystemRoles.USER;
      }
      req.user = user;
    }
  } catch (error) {
    logger.warn('[optionalShareFileAuth] cookie auth failed:', error?.message);
  }

  return next();
};

module.exports = optionalShareFileAuth;
