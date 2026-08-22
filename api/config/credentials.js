/**
 * Process-wide credential bootstrap — the first thing `server/index.js` requires.
 *
 * Loads `.env` into `process.env` and then hands off to `bootstrapCredentials()` from
 * `@librechat/api/credentials`, which resolves and validates the encryption keys
 * (`CREDS_KEY`/`CREDS_IV`, JWT secrets) that the rest of the process assumes are present.
 *
 * Design: kept as a tiny standalone module with a top-level side effect so it can be
 * required *before* any module that reads `process.env` at import time. Ordering matters —
 * `server/index.js` requires this on line 1, ahead of telemetry and every service.
 *
 * Connections:
 * - required first by `server/index.js` and `server/experimental.js`
 * - validation/derivation logic lives in `packages/api` (credentials), not here
 */
require('dotenv').config();

const { bootstrapCredentials } = require('@librechat/api/credentials');

module.exports = bootstrapCredentials();
