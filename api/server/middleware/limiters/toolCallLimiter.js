/**
 * Per-user throttle on tool-call requests: 1 per second.
 *
 * Design: a very short window with `max: 1` acts as a debounce rather than a quota. Tool calls
 * can be triggered rapidly by UI interactions, and each one can be expensive (code execution,
 * external API); serializing them per user prevents a click-storm from fanning out. Keyed by
 * `req.user.id` — an IP key would penalize shared networks.
 */
const rateLimit = require('express-rate-limit');
const { limiterCache } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const logViolation = require('~/cache/logViolation');

const { TOOL_CALL_VIOLATION_SCORE: score } = process.env;

const handler = async (req, res) => {
  const type = ViolationTypes.TOOL_CALL_LIMIT;
  const errorMessage = {
    type,
    max: 1,
    limiter: 'user',
    windowInMinutes: 1,
  };

  await logViolation(req, res, type, errorMessage, score);
  res.status(429).json({ message: 'Too many tool call requests. Try again later' });
};

const limiterOptions = {
  windowMs: 1000,
  max: 1,
  handler,
  keyGenerator: function (req) {
    return req.user?.id;
  },
  store: limiterCache('tool_call_limiter'),
};

const toolCallLimiter = rateLimit(limiterOptions);

module.exports = toolCallLimiter;
