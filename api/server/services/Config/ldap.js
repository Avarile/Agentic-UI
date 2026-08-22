/**
 * Derives the client-facing LDAP config block for `/api/config`.
 *
 * Reports only whether LDAP login is enabled and whether it expects a username instead of an
 * email (`LDAP_LOGIN_USES_USERNAME`) — enough for the login form to render correctly, and
 * nothing more. Bind DNs, credentials and search bases are deliberately never exposed, since
 * this endpoint is reachable before authentication.
 *
 * Connections: `server/routes/config.js`; strategy in `strategies/ldapStrategy.js`
 */
const { isEnabled } = require('@librechat/api');

/** @returns {TStartupConfig['ldap'] | undefined} */
const getLdapConfig = () => {
  const ldapLoginEnabled = !!process.env.LDAP_URL && !!process.env.LDAP_USER_SEARCH_BASE;

  const ldap = {
    enabled: ldapLoginEnabled,
  };
  const ldapLoginUsesUsername = isEnabled(process.env.LDAP_LOGIN_USES_USERNAME);
  if (!ldapLoginEnabled) {
    return ldap;
  }

  if (ldapLoginUsesUsername) {
    ldap.username = true;
  }

  return ldap;
};

module.exports = {
  getLdapConfig,
};
