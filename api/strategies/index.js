/**
 * Barrel for every Passport authentication strategy the server can register.
 *
 * Design: strategies are exported as *factories* (`jwtLogin()`, `googleLogin()`) rather than
 * constructed instances. Construction reads `process.env` and, for OpenID/SAML, performs
 * network discovery — so it must happen lazily, only for providers the operator actually
 * enabled, and only after `config/credentials.js` has loaded the environment.
 *
 * Note the `*AdminLogin` pairs: every social provider exposes a second strategy bound to
 * `/api/admin/oauth/<provider>/callback` and configured with `existingUsersOnly: true`. Admin
 * sign-in must never auto-provision an account, so it is a distinct Passport strategy rather
 * than a flag threaded through the normal login path.
 *
 * Connections:
 * - registered by `server/index.js` (jwt, local, ldap) and `server/socialLogins.js` (social,
 *   OpenID, SAML)
 * - admin variants are registered by `server/routes/admin/auth.js`
 * - all social providers funnel through `strategies/socialLogin.js`
 */
const { setupOpenId, getOpenIdConfig, getOpenIdEmail } = require('./openidStrategy');
const openIdJwtLogin = require('./openIdJwtStrategy');
const facebookLogin = require('./facebookStrategy');
const { facebookAdminLogin } = facebookLogin;
const discordLogin = require('./discordStrategy');
const { discordAdminLogin } = discordLogin;
const passportLogin = require('./localStrategy');
const googleLogin = require('./googleStrategy');
const { googleAdminLogin } = googleLogin;
const githubLogin = require('./githubStrategy');
const { githubAdminLogin } = githubLogin;
const { setupSaml } = require('./samlStrategy');
const appleLogin = require('./appleStrategy');
const { appleAdminLogin } = appleLogin;
const ldapLogin = require('./ldapStrategy');
const jwtLogin = require('./jwtStrategy');

module.exports = {
  appleLogin,
  appleAdminLogin,
  passportLogin,
  googleLogin,
  googleAdminLogin,
  githubLogin,
  githubAdminLogin,
  discordLogin,
  discordAdminLogin,
  jwtLogin,
  facebookLogin,
  facebookAdminLogin,
  setupOpenId,
  getOpenIdConfig,
  getOpenIdEmail,
  ldapLogin,
  setupSaml,
  openIdJwtLogin,
};
