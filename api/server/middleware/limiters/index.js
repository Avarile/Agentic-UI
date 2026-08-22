/**
 * Barrel for every rate limiter.
 *
 * Design: limiters come in two shapes and the distinction is intentional. Ones with fixed
 * policy are exported as *instances* built at import time (`loginLimiter`,
 * `registerLimiter`, `toolCallLimiter`, ...). Ones whose windows depend on config read at
 * mount time are exported as *factories* (`createTTSLimiters`, `createSTTLimiters`,
 * `createFileLimiters`, `createImportLimiters`, `createForkLimiters`) so tests and per-route
 * mounts can build them with current env values.
 *
 * Every limiter follows the same pattern: an `express-rate-limit` instance backed by
 * `limiterCache` (shared Redis/Mongo store, so limits hold across replicas), keyed by
 * `removePorts(req)` for IP limits or `req.user.id` for user limits, with a handler that logs
 * a violation before responding 429.
 */
const createTTSLimiters = require('./ttsLimiters');
const createSTTLimiters = require('./sttLimiters');

const loginLimiter = require('./loginLimiter');
const importLimiters = require('./importLimiters');
const uploadLimiters = require('./uploadLimiters');
const forkLimiters = require('./forkLimiters');
const registerLimiter = require('./registerLimiter');
const toolCallLimiter = require('./toolCallLimiter');
const messageLimiters = require('./messageLimiters');
const promptUsageLimiter = require('./promptUsageLimiter');
const verifyEmailLimiter = require('./verifyEmailLimiter');
const resetPasswordLimiter = require('./resetPasswordLimiter');
const twoFactorTempLimiter = require('./twoFactorTempLimiter');
const verifyEmailSubmissionLimiter = require('./verifyEmailSubmissionLimiter');
const resetPasswordSubmissionLimiter = require('./resetPasswordSubmissionLimiter');

module.exports = {
  ...uploadLimiters,
  ...importLimiters,
  ...messageLimiters,
  ...forkLimiters,
  ...promptUsageLimiter,
  loginLimiter,
  registerLimiter,
  toolCallLimiter,
  createTTSLimiters,
  createSTTLimiters,
  verifyEmailLimiter,
  resetPasswordLimiter,
  verifyEmailSubmissionLimiter,
  resetPasswordSubmissionLimiter,
  twoFactorTempLimiter,
};
