/**
 * Final handler for every OAuth/SAML callback — turns a verified provider identity into a session.
 *
 * `createOAuthHandler(redirectUri)` returns the handler mounted at the end of each callback
 * chain in `server/routes/oauth.js`.
 *
 * Design:
 * - `checkBan` is invoked *inside* the handler rather than as route middleware, because the
 *   user identity only exists after the provider callback has been verified.
 * - Entra group memberships are synced here (`syncUserEntraGroupMemberships`) so a user's group
 *   ACLs are current from their first request, not one request late.
 * - Admin-panel logins are detected (`isAdminPanelRedirect`) and handed a short-lived exchange
 *   code (`generateAdminExchangeCode`) rather than tokens in the URL — the admin console runs
 *   on a different origin, so tokens must not travel as query parameters.
 * - OpenID users get `setOpenIDAuthTokens` (which can store the IdP tokens for reuse); everyone
 *   else gets `setAuthTokens`.
 * - Ends in a redirect, never JSON: the browser is mid-navigation.
 *
 * Connections: `server/services/AuthService.js`, `services/PermissionService.js`
 */
const { CacheKeys } = require('librechat-data-provider');
const { logger, DEFAULT_SESSION_EXPIRY } = require('@librechat/data-schemas');
const {
  isEnabled,
  getAdminPanelUrl,
  isAdminPanelRedirect,
  generateAdminExchangeCode,
} = require('@librechat/api');
const { syncUserEntraGroupMemberships } = require('~/server/services/PermissionService');
const { setAuthTokens, setOpenIDAuthTokens } = require('~/server/services/AuthService');
const getLogStores = require('~/cache/getLogStores');
const { checkBan } = require('~/server/middleware');
const { generateToken } = require('~/models');

const domains = {
  client: process.env.DOMAIN_CLIENT,
  server: process.env.DOMAIN_SERVER,
};

function createOAuthHandler(redirectUri = domains.client) {
  /**
   * A handler to process OAuth authentication results.
   * @type {Function}
   * @param {ServerRequest} req - Express request object.
   * @param {ServerResponse} res - Express response object.
   * @param {NextFunction} next - Express next middleware function.
   */
  return async (req, res, next) => {
    try {
      if (res.headersSent) {
        return;
      }

      await checkBan(req, res);
      if (req.banned) {
        return;
      }

      /** Check if this is an admin panel redirect (cross-origin or same-origin subpath) */
      if (isAdminPanelRedirect(redirectUri, getAdminPanelUrl(), domains.client)) {
        /** For admin panel, generate exchange code instead of setting cookies */
        const cache = getLogStores(CacheKeys.ADMIN_OAUTH_EXCHANGE);
        const sessionExpiry = Number(process.env.SESSION_EXPIRY) || DEFAULT_SESSION_EXPIRY;
        const token = await generateToken(req.user, sessionExpiry);

        let refreshToken;
        if (req.user.provider === 'openid') {
          if (isEnabled(process.env.OPENID_REUSE_TOKENS) === true) {
            refreshToken =
              req.user.tokenset?.refresh_token || req.user.federatedTokens?.refresh_token;
          }
        } else if (req.user.provider === 'google') {
          refreshToken = req.authInfo?.refreshToken;
        }
        const expiresAt = Date.now() + sessionExpiry;

        const callbackUrl = new URL(redirectUri);
        const exchangeCode = await generateAdminExchangeCode(
          cache,
          req.user,
          token,
          refreshToken,
          callbackUrl.origin,
          req.pkceChallenge,
          expiresAt,
        );
        callbackUrl.searchParams.set('code', exchangeCode);
        logger.info(`[OAuth] Admin panel redirect with exchange code for user: ${req.user.email}`);
        return res.redirect(callbackUrl.toString());
      }

      /** Standard OAuth flow - set cookies and redirect */
      if (
        req.user &&
        req.user.provider == 'openid' &&
        isEnabled(process.env.OPENID_REUSE_TOKENS) === true
      ) {
        await syncUserEntraGroupMemberships(req.user, req.user.tokenset.access_token);
        setOpenIDAuthTokens(req.user.tokenset, req, res, {
          userId: req.user._id.toString(),
          tenantId: req.user.tenantId,
        });
      } else {
        await setAuthTokens(req.user._id, res, null, req);
      }
      res.redirect(redirectUri);
    } catch (err) {
      logger.error('Error in setting authentication tokens:', err);
      next(err);
    }
  };
}

module.exports = {
  createOAuthHandler,
};
