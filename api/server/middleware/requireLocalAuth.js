/**
 * Gate for email/password login — runs the `local` Passport strategy.
 *
 * Design: uses the callback form of `passport.authenticate` rather than the middleware form so
 * the three outcomes can be mapped to distinct HTTP responses: a thrown error goes to the
 * error handler, no user is 404, and a user-facing `info.message` (e.g. "verify your email",
 * "use your SSO provider") is 422 with the message forwarded. The default middleware form
 * would collapse all of these into one 401.
 *
 * Connections:
 * - strategy: `strategies/localStrategy.js`; used by `server/routes/auth.js`
 */
const passport = require('passport');
const { logger } = require('@librechat/data-schemas');

const requireLocalAuth = (req, res, next) => {
  passport.authenticate('local', (err, user, info) => {
    if (err) {
      logger.error('[requireLocalAuth] Error at passport.authenticate:', err);
      return next(err);
    }
    if (!user) {
      logger.debug('[requireLocalAuth] Error: No user');
      return res.status(404).send(info);
    }
    if (info && info.message) {
      logger.debug('[requireLocalAuth] Error: ' + info.message);
      return res.status(422).send({ message: info.message });
    }
    req.user = user;
    next();
  })(req, res, next);
};

module.exports = requireLocalAuth;
