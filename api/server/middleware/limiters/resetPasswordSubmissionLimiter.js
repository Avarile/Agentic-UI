/**
 * IP rate limit on password-reset token *submissions* (default 2 per 2 minutes).
 *
 * Design: separate from the request limiter because the two steps are attacked differently —
 * requesting is email spam, submitting is token brute force. Its env vars fall back to the
 * `RESET_PASSWORD_*` values, so operators who tune only the request limiter get consistent
 * behaviour on both. The violation record carries `limiter: 'submission'` so the two are
 * distinguishable in the logs.
 */
const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const {
  RESET_PASSWORD_SUBMISSION_WINDOW = process.env.RESET_PASSWORD_WINDOW ?? 2,
  RESET_PASSWORD_SUBMISSION_MAX = process.env.RESET_PASSWORD_MAX ?? 2,
  RESET_PASSWORD_SUBMISSION_VIOLATION_SCORE: score,
} = process.env;
const windowMs = RESET_PASSWORD_SUBMISSION_WINDOW * 60 * 1000;
const max = RESET_PASSWORD_SUBMISSION_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many attempts, please try again after ${windowInMinutes} minute(s)`;

const handler = async (req, res) => {
  const type = ViolationTypes.RESET_PASSWORD_LIMIT;
  const errorMessage = {
    type,
    max,
    windowInMinutes,
    limiter: 'submission',
  };

  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('reset_password_submission_limiter'),
};

const resetPasswordSubmissionLimiter = rateLimit(limiterOptions);

module.exports = resetPasswordSubmissionLimiter;
