/**
 * Barrel for the agents endpoint: `buildOptions` and `initializeClient`.
 *
 * These two names are the contract every endpoint implements (see the `buildFunction` table in
 * `server/middleware/buildEndpointOption.js`), which is what lets the chat routes stay
 * endpoint-agnostic.
 */
const build = require('./build');
const initialize = require('./initialize');

module.exports = {
  ...build,
  ...initialize,
};
