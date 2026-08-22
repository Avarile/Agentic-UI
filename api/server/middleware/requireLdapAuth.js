/**
 * Gate for LDAP/Active Directory login — runs the `ldapauth` Passport strategy.
 *
 * Uses the callback form so a bind failure can be distinguished from a missing user (404 with
 * the strategy's `info` payload forwarded, which carries the directory's reason).
 *
 * Connections:
 * - strategy: `strategies/ldapStrategy.js` (registered only when LDAP env vars are set)
 * - used by `server/routes/auth.js`
 */
const passport = require('passport');

const requireLdapAuth = (req, res, next) => {
  passport.authenticate('ldapauth', (err, user, info) => {
    if (err) {
      console.log({
        title: '(requireLdapAuth) Error at passport.authenticate',
        parameters: [{ name: 'error', value: err }],
      });
      return next(err);
    }
    if (!user) {
      console.log({
        title: '(requireLdapAuth) Error: No user',
      });
      return res.status(404).send(info);
    }
    req.user = user;
    next();
  })(req, res, next);
};
module.exports = requireLdapAuth;
