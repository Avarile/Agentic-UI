/**
 * Barrel for the Azure Assistants endpoint: `buildOptions` and `initializeClient`.
 *
 * Note there is no `title` export — Azure assistants reuse the standard assistants titling
 * path.
 */
const buildOptions = require('./build');
const initializeClient = require('./initialize');

module.exports = {
  buildOptions,
  initializeClient,
};
