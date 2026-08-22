/**
 * Minimal Winston logger dedicated to authentication/login events.
 *
 * Writes JSON lines to the console and, unless `LOG_TO_FILE=false`, to `login-logs.log`.
 *
 * Design: auth events are kept in their own file with their own format so they can be shipped
 * to a SIEM or retained on a different schedule than application logs. It is deliberately
 * separate from both the main `@librechat/data-schemas` logger and the Meili sync logger in
 * `config/meiliLogger.js`.
 *
 * Connections:
 * - wrapped by `utils/LoggingSystem.js`, which adds redaction and level gating
 */
const winston = require('winston');

const useFileLogging =
  typeof process.env.LOG_TO_FILE !== 'string' || process.env.LOG_TO_FILE.toLowerCase() !== 'false';

const transports = [new winston.transports.Console()];

if (useFileLogging) {
  transports.push(new winston.transports.File({ filename: 'login-logs.log' }));
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports,
});

module.exports = logger;
