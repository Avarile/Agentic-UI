/**
 * Records an abuse/violation event for a user and escalates it to a ban when warranted.
 *
 * Increments the per-type violation counter, stamps the caller's `errorMessage` object in
 * place with `user_id`/`prev_count`/`violation_count`/`date`, delegates the ban decision to
 * `banViolation`, and finally appends the event to the user's general violation log.
 *
 * Design: mutating the passed `errorMessage` is deliberate — the same object is then returned
 * to the client by `denyRequest`/`abortMiddleware`, so the count and ban flag reach the UI
 * without a second lookup. Two stores are written (per-type counter + general history)
 * because the counter drives policy while the history is for operator forensics.
 *
 * Connections:
 * - calls `cache/banViolation.js`; reads stores from `cache/getLogStores.js`
 * - called by the rate limiters in `server/middleware/limiters/*`, `moderateText`,
 *   `checkBan`, `validateModel`, `validateMessageReq` and the balance/token checks
 */
const { isEnabled } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const getLogStores = require('./getLogStores');
const banViolation = require('./banViolation');

/**
 * Logs the violation.
 *
 * @param {Object} req - Express request object containing user information.
 * @param {Object} res - Express response object.
 * @param {string} type - The type of violation.
 * @param {Object} errorMessage - The error message to log.
 * @param {number | string} [score=1] - The severity of the violation. Defaults to 1
 */
const logViolation = async (req, res, type, errorMessage, score = 1) => {
  const userId = req.user?.id ?? req.user?._id;
  if (!userId) {
    return;
  }
  const logs = getLogStores(ViolationTypes.GENERAL);
  const violationLogs = getLogStores(type);
  const key = isEnabled(process.env.USE_REDIS) ? `${type}:${userId}` : userId;

  const userViolations = (await violationLogs.get(key)) ?? 0;
  const violationCount = +userViolations + +score;
  await violationLogs.set(key, violationCount);

  errorMessage.user_id = userId;
  errorMessage.prev_count = userViolations;
  errorMessage.violation_count = violationCount;
  errorMessage.date = new Date().toISOString();

  await banViolation(req, res, errorMessage);
  const userLogs = (await logs.get(key)) ?? [];
  userLogs.push(errorMessage);
  delete errorMessage.user_id;
  await logs.set(key, userLogs);
};

module.exports = logViolation;
