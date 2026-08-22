/**
 * Rejects requests whose User-Agent is not a recognized browser.
 *
 * A missing/unparseable browser name is logged as a `NON_BROWSER` violation with a high
 * default score (20) — this is a scripted-abuse signal, so it should escalate toward a ban
 * quickly rather than merely being refused.
 *
 * Design caveat: this is a heuristic deterrent, not a security control, and it will reject
 * legitimate API clients. That is why it is applied selectively rather than globally.
 *
 * Connections: violations via `cache/logViolation.js`
 */
const uap = require('ua-parser-js');
const { ViolationTypes } = require('librechat-data-provider');
const { handleError } = require('@librechat/api');
const { logViolation } = require('../../cache');

/**
 * Middleware to parse User-Agent header and check if it's from a recognized browser.
 * If the User-Agent is not recognized as a browser, logs a violation and sends an error response.
 *
 * @function
 * @async
 * @param {Object} req - Express request object.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function.
 * @returns {void} Sends an error response if the User-Agent is not recognized as a browser.
 *
 * @example
 * app.use(uaParser);
 */
async function uaParser(req, res, next) {
  const { NON_BROWSER_VIOLATION_SCORE: score = 20 } = process.env;
  const ua = uap(req.headers['user-agent']);

  if (!ua.browser.name) {
    const type = ViolationTypes.NON_BROWSER;
    await logViolation(req, res, type, { type }, score);
    return handleError(res, { message: 'Illegal request' });
  }
  next();
}

module.exports = uaParser;
