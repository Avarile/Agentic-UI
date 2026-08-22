/**
 * Conditionally registers every social / SSO Passport strategy and their sessions.
 *
 * Called from `server/index.js` only when `ALLOW_SOCIAL_LOGIN` is enabled.
 *
 * Design:
 * - Each provider is gated on *its own* required env vars being present, so an operator
 *   enables providers purely by configuration and an unused provider is never constructed
 *   (which would fail validation or attempt discovery).
 * - Every provider registers two strategies: the default one and a named `<provider>Admin`
 *   one bound to the admin callback with `existingUsersOnly`. Naming them explicitly is what
 *   lets `server/routes/admin/auth.js` select the non-provisioning variant.
 * - OpenID and SAML additionally need `express-session` because their handshakes are stateful
 *   (state/nonce, RelayState). Sessions are stored in the Keyv stores from
 *   `cache/getLogStores.js` rather than in memory, so they survive a restart and work across
 *   replicas.
 * - `getOpenIdSessionExpiry` widens the session TTL to at least
 *   `OPENID_REUSE_MAX_SESSION_AGE_MS` when `OPENID_REUSE_TOKENS` is on: token reuse requires
 *   the session to outlive the token, otherwise the stored tokens become unreachable.
 * - Cookie `secure` flag comes from `shouldUseSecureCookie()` so local HTTP development works
 *   without an override while production stays secure.
 *
 * Connections:
 * - strategy factories from `strategies/index.js`
 * - session stores from `cache/getLogStores.js`
 * - admin variants consumed by `server/routes/admin/auth.js`
 */
const passport = require('passport');
const session = require('express-session');
const { CacheKeys } = require('librechat-data-provider');
const { math, isEnabled, shouldUseSecureCookie } = require('@librechat/api');
const { logger, DEFAULT_SESSION_EXPIRY } = require('@librechat/data-schemas');
const {
  openIdJwtLogin,
  facebookLogin,
  facebookAdminLogin,
  discordLogin,
  discordAdminLogin,
  setupOpenId,
  googleLogin,
  googleAdminLogin,
  githubLogin,
  githubAdminLogin,
  appleLogin,
  appleAdminLogin,
  setupSaml,
} = require('~/strategies');
const { getLogStores } = require('~/cache');

const DEFAULT_OPENID_REUSE_MAX_SESSION_AGE_MS = 15 * 60 * 1000;

const getSessionExpiry = () => math(process.env.SESSION_EXPIRY, DEFAULT_SESSION_EXPIRY);

const getOpenIdSessionExpiry = () => {
  const sessionExpiry = getSessionExpiry();
  if (!isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    return sessionExpiry;
  }

  const reuseMaxSessionAge = math(
    process.env.OPENID_REUSE_MAX_SESSION_AGE_MS,
    DEFAULT_OPENID_REUSE_MAX_SESSION_AGE_MS,
  );
  return Math.max(sessionExpiry, reuseMaxSessionAge);
};

/**
 * Configures OpenID Connect for the application.
 * @param {Express.Application} app - The Express application instance.
 * @returns {Promise<void>}
 */
async function configureOpenId(app) {
  logger.info('Configuring OpenID Connect...');
  const sessionExpiry = getOpenIdSessionExpiry();
  const sessionOptions = {
    secret: process.env.OPENID_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: getLogStores(CacheKeys.OPENID_SESSION),
    cookie: {
      maxAge: sessionExpiry,
      secure: shouldUseSecureCookie(),
    },
  };
  app.use(session(sessionOptions));
  app.use(passport.session());

  const config = await setupOpenId();
  if (!config) {
    logger.error('OpenID Connect configuration failed - strategy not registered.');
    return;
  }

  if (isEnabled(process.env.OPENID_REUSE_TOKENS)) {
    logger.info('OpenID token reuse is enabled.');
    passport.use('openidJwt', openIdJwtLogin(config));
  }
  logger.info('OpenID Connect configured successfully.');
}

/**
 *
 * @param {Express.Application} app
 */
const configureSocialLogins = async (app) => {
  logger.info('Configuring social logins...');

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    passport.use(googleLogin());
    passport.use('googleAdmin', googleAdminLogin());
  }
  if (process.env.FACEBOOK_CLIENT_ID && process.env.FACEBOOK_CLIENT_SECRET) {
    passport.use(facebookLogin());
    passport.use('facebookAdmin', facebookAdminLogin());
  }
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    passport.use(githubLogin());
    passport.use('githubAdmin', githubAdminLogin());
  }
  if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
    passport.use(discordLogin());
    passport.use('discordAdmin', discordAdminLogin());
  }
  if (process.env.APPLE_CLIENT_ID && process.env.APPLE_PRIVATE_KEY_PATH) {
    passport.use(appleLogin());
    passport.use('appleAdmin', appleAdminLogin());
  }
  if (
    process.env.OPENID_CLIENT_ID &&
    (isEnabled(process.env.OPENID_USE_PKCE) || process.env.OPENID_CLIENT_SECRET?.trim()) &&
    process.env.OPENID_ISSUER &&
    process.env.OPENID_SCOPE &&
    process.env.OPENID_SESSION_SECRET
  ) {
    await configureOpenId(app);
  }
  if (
    process.env.SAML_ENTRY_POINT &&
    process.env.SAML_ISSUER &&
    process.env.SAML_CERT &&
    process.env.SAML_SESSION_SECRET
  ) {
    logger.info('Configuring SAML Connect...');
    const sessionExpiry = getSessionExpiry();
    const sessionOptions = {
      secret: process.env.SAML_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      store: getLogStores(CacheKeys.SAML_SESSION),
      cookie: {
        maxAge: sessionExpiry,
        secure: shouldUseSecureCookie(),
      },
    };
    app.use(session(sessionOptions));
    app.use(passport.session());
    setupSaml();

    logger.info('SAML Connect configured.');
  }
};

module.exports = configureSocialLogins;
