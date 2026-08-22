/**
 * Post-authentication email-domain allow-list check for social logins.
 *
 * Design: this runs in the OAuth *callback* path, after the provider has authenticated the
 * user, so the correct failure mode is a redirect to `/login` rather than a JSON error — the
 * browser is mid-redirect and has no JSON handler. Any thrown error also redirects, so a
 * config lookup failure fails closed.
 *
 * Note the domain list is also checked inside `strategies/socialLogin.js`; this middleware is
 * the enforcement point for flows that reach a callback route without going through that
 * verify callback.
 *
 * Connections:
 * - config via `server/services/Config`; `isEmailDomainAllowed` from `packages/api`
 * - used by `server/routes/oauth.js`
 */
const { logger } = require('@librechat/data-schemas');
const { getAppConfigOptionsFromUser, isEmailDomainAllowed } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');

/**
 * Checks the domain's social login is allowed
 *
 * @async
 * @function
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Next middleware function.
 *
 * @returns {Promise<void>} - Calls next middleware if the domain's email is allowed, otherwise redirects to login
 */
const checkDomainAllowed = async (req, res, next) => {
  try {
    const email = req?.user?.email;
    const appConfig = await getAppConfig(getAppConfigOptionsFromUser(req?.user));

    if (email && !isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
      logger.error(`[Social Login] [Social Login not allowed] [Email: ${email}]`);
      res.redirect('/login');
      return;
    }

    next();
  } catch (error) {
    logger.error('[checkDomainAllowed] Error checking domain:', error);
    res.redirect('/login');
  }
};

module.exports = checkDomainAllowed;
