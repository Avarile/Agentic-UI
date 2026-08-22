/**
 * IP rate limit on account creation (`REGISTER_MAX` per `REGISTER_WINDOW`, default 5/60min).
 *
 * Deliberately much tighter than the login limiter: this is the primary defence against bulk
 * account creation. Logs a `REGISTRATIONS` violation before responding 429.
 */
const rateLimit = require('express-rate-limit');
const { ViolationTypes } = require('librechat-data-provider');
const { limiterCache, removePorts } = require('@librechat/api');
const { logViolation } = require('~/cache');

const { REGISTER_WINDOW = 60, REGISTER_MAX = 5, REGISTRATION_VIOLATION_SCORE: score } = process.env;
const windowMs = REGISTER_WINDOW * 60 * 1000;
const max = REGISTER_MAX;
const windowInMinutes = windowMs / 60000;
const message = `Too many accounts created, please try again after ${windowInMinutes} minutes`;

const handler = async (req, res) => {
  const type = ViolationTypes.REGISTRATIONS;
  const errorMessage = {
    type,
    max,
    windowInMinutes,
  };

  await logViolation(req, res, type, errorMessage, score);
  return res.status(429).json({ message });
};

const limiterOptions = {
  windowMs,
  max,
  handler,
  keyGenerator: removePorts,
  store: limiterCache('register_limiter'),
};

const registerLimiter = rateLimit(limiterOptions);

module.exports = registerLimiter;
