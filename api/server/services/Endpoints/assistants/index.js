/**
 * Barrel for the OpenAI Assistants endpoint: `buildOptions`, `initializeClient`, `addTitle`.
 *
 * Same three-name contract as the other endpoints, so `buildEndpointOption` and the chat
 * controllers stay endpoint-agnostic.
 */
const addTitle = require('./title');
const buildOptions = require('./build');
const initializeClient = require('./initalize');

module.exports = {
  addTitle,
  buildOptions,
  initializeClient,
};
