/**
 * IP rate limit on email-verification token submissions (default 2 per 2 minutes).
 *
 * Separate from the resend limiter so token brute force and mail spam are limited (and logged,
 * via `limiter: 'submission'`) independently. Env vars fall back to the `VERIFY_EMAIL_*`
 * values.
 */
const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const {
  VERIFY_EMAIL_SUBMISSION_WINDOW = process.env.VERIFY_EMAIL_WINDOW ?? 2,
  VERIFY_EMAIL_SUBMISSION_MAX = process.env.VERIFY_EMAIL_MAX ?? 2,
  VERIFY_EMAIL_SUBMISSION_VIOLATION_SCORE: score,
} = process.env;
const windowMs = VERIFY_EMAIL_SUBMISSION_WINDOW * 60 * 1000;
const max = VERIFY_EMAIL_SUBMISSION_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many attempts, please try again after ${windowInMinutes} minute(s)`;

const handler = async (req, res) => {
  const type = ViolationTypes.VERIFY_EMAIL_LIMIT;
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
  store: limiterCache('verify_email_submission_limiter'),
};

const verifyEmailSubmissionLimiter = rateLimit(limiterOptions);

module.exports = verifyEmailSubmissionLimiter;
