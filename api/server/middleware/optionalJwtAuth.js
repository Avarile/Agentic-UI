/**
 * Authenticates if credentials are present, but never rejects the request.
 *
 * Same strategy-selection logic as `requireJwtAuth` (jwt vs. openidJwt by cookie), and it
 * establishes tenant context when a user is resolved, but a missing or invalid token simply
 * falls through with `req.user` unset.
 *
 * Why: routes that must serve both signed-in and anonymous callers — `/api/config` (the UI
 * needs the config before login) and shared-link viewing — would otherwise need two separate
 * handlers. `req.authStrategy` is recorded so downstream code can tell how the user was
 * authenticated.
 *
 * Connections:
 * - mounted on `/api/config` in `server/index.js`; used by share/preview routes
 * - strict counterpart: `server/middleware/requireJwtAuth.js`
 */
const cookies = require('cookie');
const passport = require('passport');
const { isEnabled, tenantContextMiddleware } = require('@librechat/api');

const hasPassportStrategy = (strategy) =>
  typeof passport._strategy === 'function' && passport._strategy(strategy) != null;

// This middleware does not require authentication,
// but if the user is authenticated, it will set the user object
// and establish tenant ALS context.
const optionalJwtAuth = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const tokenProvider = cookieHeader ? cookies.parse(cookieHeader).token_provider : null;
  const useOpenIdJwt =
    tokenProvider === 'openid' &&
    isEnabled(process.env.OPENID_REUSE_TOKENS) &&
    hasPassportStrategy('openidJwt');
  const callback = (err, user) => {
    if (err) {
      return next(err);
    }
    if (user) {
      req.user = user;
      req.authStrategy = useOpenIdJwt ? 'openidJwt' : 'jwt';
      return tenantContextMiddleware(req, res, next);
    }
    next();
  };
  if (useOpenIdJwt) {
    return passport.authenticate('openidJwt', { session: false }, callback)(req, res, next);
  }
  passport.authenticate('jwt', { session: false }, callback)(req, res, next);
};

module.exports = optionalJwtAuth;
