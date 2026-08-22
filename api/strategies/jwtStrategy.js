/**
 * Passport JWT strategy — authenticates every normal API request from the bearer token.
 *
 * Loads the user by `payload.id` with sensitive fields projected out (`password`, `__v`,
 * `totpSecret`, `backupCodes`) so no route can accidentally serialize them.
 *
 * Design details that matter:
 * - `user.id` is set from `_id` because the rest of the codebase reads `req.user.id`.
 * - `idOnTheSource ??= null` is deliberate: on a full user document, *absent* means a local
 *   user, and setting it to `null` short-circuits `getUserPrincipals`' fallback directory
 *   lookup — saving a round trip on every authenticated request.
 * - A user with no `role` is backfilled to `SystemRoles.USER` and persisted, so accounts that
 *   predate role support keep working without a migration.
 *
 * Connections:
 * - registered in `server/index.js`; consumed by `server/middleware/requireJwtAuth.js` and
 *   `optionalJwtAuth.js`
 * - the OpenID equivalent is `strategies/openIdJwtStrategy.js`
 */
const { logger } = require('@librechat/data-schemas');
const { SystemRoles } = require('librechat-data-provider');
const { Strategy: JwtStrategy, ExtractJwt } = require('passport-jwt');
const { getUserById, updateUser } = require('~/models');

// JWT strategy
const jwtLogin = () =>
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
    },
    async (payload, done) => {
      try {
        const user = await getUserById(payload?.id, '-password -__v -totpSecret -backupCodes');
        if (user) {
          user.id = user._id.toString();
          /** Absent on the full doc means local user; null skips getUserPrincipals' fallback lookup */
          user.idOnTheSource ??= null;
          if (!user.role) {
            user.role = SystemRoles.USER;
            await updateUser(user.id, { role: user.role });
          }
          done(null, user);
        } else {
          logger.warn('[jwtLogin] JwtStrategy => no user found: ' + payload?.id);
          done(null, false);
        }
      } catch (err) {
        done(err, false);
      }
    },
  );

module.exports = jwtLogin;
