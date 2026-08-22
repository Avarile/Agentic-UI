/**
 * Redaction-aware wrapper around `utils/logger.js`.
 *
 * Exposes a numeric level scale (`TRACE`..`FATAL`), a `setLevel` switch, and a `log` facade
 * whose methods drop messages below the active level.
 *
 * Design: the `redactPatterns` list exists because sensitive values often arrive as *keys* in
 * an object being logged (`api_key`, `client_id`, `authorization_nonce`, ...) rather than as
 * recognizable secrets. Pattern-based key redaction catches those without every call site
 * having to remember to strip them — defence in depth for the auth paths that log request
 * context.
 *
 * Connections:
 * - delegates output to `utils/logger.js`
 * - used by the auth strategies in `strategies/*`
 */
const logger = require('./logger');

// Sanitize outside the logger paths. This is useful for sanitizing variables directly with Regex and patterns.
const redactPatterns = [
  // Array of regular expressions for redacting patterns
  /api[-_]?key/i,
  /password/i,
  /token/i,
  /secret/i,
  /key/i,
  /certificate/i,
  /client[-_]?id/i,
  /authorization[-_]?code/i,
  /authorization[-_]?login[-_]?hint/i,
  /authorization[-_]?acr[-_]?values/i,
  /authorization[-_]?response[-_]?mode/i,
  /authorization[-_]?nonce/i,
];

/*
  // Example of redacting sensitive data from object class instances
  function redactSensitiveData(obj) {
    if (obj instanceof User) {
      return {
        ...obj.toObject(),
        password: '***', // Redact the password field
      };
    }
    return obj;
  }

  // Example of redacting sensitive data from object class instances
  logger.info({ newUser: redactSensitiveData(newUser) }, 'newUser');
*/

const levels = {
  TRACE: 10,
  DEBUG: 20,
  INFO: 30,
  WARN: 40,
  ERROR: 50,
  FATAL: 60,
};

let level = levels.INFO;

module.exports = {
  levels,
  setLevel: (l) => (level = l),
  log: {
    trace: (msg) => {
      if (level <= levels.TRACE) {
        return;
      }
      logger.trace(msg);
    },
    debug: (msg) => {
      if (level <= levels.DEBUG) {
        return;
      }
      logger.debug(msg);
    },
    info: (msg) => {
      if (level <= levels.INFO) {
        return;
      }
      logger.info(msg);
    },
    warn: (msg) => {
      if (level <= levels.WARN) {
        return;
      }
      logger.warn(msg);
    },
    error: (msg) => {
      if (level <= levels.ERROR) {
        return;
      }
      logger.error(msg);
    },
    fatal: (msg) => {
      if (level <= levels.FATAL) {
        return;
      }
      logger.fatal(msg);
    },

    // Custom loggers
    parameters: (parameters) => {
      if (level <= levels.TRACE) {
        return;
      }
      logger.debug({ parameters }, 'Function Parameters');
    },
    functionName: (name) => {
      if (level <= levels.TRACE) {
        return;
      }
      logger.debug(`EXECUTING: ${name}`);
    },
    flow: (flow) => {
      if (level <= levels.INFO) {
        return;
      }
      logger.debug(`BEGIN FLOW: ${flow}`);
    },
    variable: ({ name, value }) => {
      if (level <= levels.DEBUG) {
        return;
      }
      // Check if the variable name matches any of the redact patterns and redact the value
      let sanitizedValue = value;
      for (const pattern of redactPatterns) {
        if (pattern.test(name)) {
          sanitizedValue = '***';
          break;
        }
      }
      logger.debug({ variable: { name, value: sanitizedValue } }, `VARIABLE ${name}`);
    },
    request: () => (req, res, next) => {
      if (level < levels.DEBUG) {
        return next();
      }
      logger.debug({ query: req.query, body: req.body }, `Hit URL ${req.url} with following`);
      return next();
    },
  },
};
