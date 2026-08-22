/**
 * The shared verify-callback factory behind every social (OAuth2) provider.
 *
 * `socialLogin(provider, getProfileDetails, options)` returns a Passport verify callback. Each
 * provider file supplies only its `getProfileDetails` normalizer; all account resolution,
 * policy enforcement and provisioning logic lives here exactly once.
 *
 * Design — the account lookup is deliberately two-stage and order-sensitive:
 * 1. Look up by provider id (`googleId`, `githubId`, ...) — the stable identifier.
 * 2. Fall back to email, logging a warning. This allows linking a pre-existing account, but is
 *    the weaker match, so every branch below re-checks it.
 *
 * Domain allow-listing runs *twice* on purpose: once against the base config before any user
 * lookup (so a disallowed domain is rejected before touching tenant data), then again against
 * the tenant-resolved config once the user is known, because a tenant may narrow the list.
 *
 * `options.existingUsersOnly` is the admin-login mode and carries the strictest rules: a
 * mismatched stored provider id is rejected outright; migrating an account that has no
 * provider id yet is blocked for tenanted users (the OAuth callback carries no tenant scope)
 * and, for untenanted users, is followed by a read-back verification so a concurrent write
 * cannot win the race and hand over the wrong account.
 *
 * An existing account owned by a *different* provider is an error carrying `error.provider`,
 * so the UI can tell the user which provider to use instead of a generic failure.
 *
 * Connections:
 * - provisioning/avatar work delegated to `strategies/process.js`
 * - provider-specific normalizers: `googleStrategy.js`, `githubStrategy.js`,
 *   `discordStrategy.js`, `facebookStrategy.js`, `appleStrategy.js`
 * - config via `server/services/Config` + `resolveAppConfigForUser` from `packages/api`
 */
const { logger } = require('@librechat/data-schemas');
const { ErrorTypes } = require('librechat-data-provider');
const { isEnabled, isEmailDomainAllowed, resolveAppConfigForUser } = require('@librechat/api');
const { createSocialUser, handleExistingUser } = require('./process');
const { getAppConfig } = require('~/server/services/Config');
const { findUser, updateUser } = require('~/models');

const socialLogin =
  (provider, getProfileDetails, options = {}) =>
  async (accessToken, refreshToken, idToken, profile, cb) => {
    try {
      const { email, id, avatarUrl, username, name, emailVerified } = getProfileDetails({
        idToken,
        profile,
      });

      const baseConfig = await getAppConfig({ baseOnly: true });
      if (!isEmailDomainAllowed(email, baseConfig?.registration?.allowedDomains)) {
        logger.error(
          `[${provider}Login] Authentication blocked - email domain not allowed [Email: ${email}]`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Email domain not allowed';
        return cb(error);
      }

      const providerKey = `${provider}Id`;
      let existingUser = null;

      /** First try to find user by provider ID (e.g., googleId, facebookId) */
      if (id && typeof id === 'string') {
        existingUser = await findUser({ [providerKey]: id });
      }

      /** If not found by provider ID, try finding by email */
      if (!existingUser) {
        existingUser = await findUser({ email: email?.trim() });
        if (existingUser) {
          logger.warn(`[${provider}Login] User found by email: ${email} but not by ${providerKey}`);
        }
      }

      const appConfig = existingUser?.tenantId
        ? await resolveAppConfigForUser(getAppConfig, existingUser)
        : baseConfig;

      if (!isEmailDomainAllowed(email, appConfig?.registration?.allowedDomains)) {
        logger.error(
          `[${provider}Login] Authentication blocked - email domain not allowed [Email: ${email}]`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Email domain not allowed';
        return cb(error);
      }

      const passResult = (user) =>
        refreshToken && provider === 'google' ? cb(null, user, { refreshToken }) : cb(null, user);

      if (existingUser?.provider === provider) {
        if (
          options.existingUsersOnly &&
          id &&
          existingUser[providerKey] &&
          existingUser[providerKey] !== id
        ) {
          logger.warn(
            `[${provider}Login] Rejected admin email fallback for ${email}: stored ${providerKey} does not match`,
          );
          const error = new Error(ErrorTypes.AUTH_FAILED);
          error.code = ErrorTypes.AUTH_FAILED;
          return cb(error);
        }
        if (options.existingUsersOnly && id && !existingUser[providerKey]) {
          if (existingUser.tenantId) {
            logger.warn(
              `[${provider}Login] Admin migrate blocked for tenanted user ${email}: no tenant scope in OAuth callback`,
            );
            const tenantError = new Error(ErrorTypes.AUTH_FAILED);
            tenantError.code = ErrorTypes.AUTH_FAILED;
            return cb(tenantError);
          }
          await updateUser(existingUser._id, { [providerKey]: id });
          const verified = await findUser({ _id: existingUser._id, [providerKey]: id });
          if (!verified) {
            logger.warn(
              `[${provider}Login] Admin migrate superseded by concurrent write, denying: ${email}`,
            );
            const concurrentError = new Error(ErrorTypes.AUTH_FAILED);
            concurrentError.code = ErrorTypes.AUTH_FAILED;
            return cb(concurrentError);
          }
          existingUser[providerKey] = id;
        }
        await handleExistingUser(existingUser, avatarUrl, appConfig, email);
        return passResult(existingUser);
      } else if (existingUser) {
        logger.info(
          `[${provider}Login] User ${email} already exists with provider ${existingUser.provider}`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.provider = existingUser.provider;
        return cb(error);
      }

      if (options.existingUsersOnly) {
        logger.error(
          `[${provider}Login] Admin auth blocked - user does not exist [Email: ${email}]`,
        );
        return cb(null, false, { message: 'User does not exist' });
      }

      const ALLOW_SOCIAL_REGISTRATION = isEnabled(process.env.ALLOW_SOCIAL_REGISTRATION);
      if (!ALLOW_SOCIAL_REGISTRATION) {
        logger.error(
          `[${provider}Login] Registration blocked - social registration is disabled [Email: ${email}]`,
        );
        const error = new Error(ErrorTypes.AUTH_FAILED);
        error.code = ErrorTypes.AUTH_FAILED;
        error.message = 'Social registration is disabled';
        return cb(error);
      }

      const newUser = await createSocialUser({
        email,
        avatarUrl,
        provider,
        providerKey: `${provider}Id`,
        providerId: id,
        username,
        name,
        emailVerified,
        appConfig,
      });
      return passResult(newUser);
    } catch (err) {
      logger.error(`[${provider}Login]`, err);
      return cb(err);
    }
  };

module.exports = socialLogin;
