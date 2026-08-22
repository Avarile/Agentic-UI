/**
 * Barrel for the legacy client layer: `TextStream` and the tool-loading utilities.
 *
 * Note how small this is — `BaseClient` and `OllamaClient` are *not* re-exported. Callers that
 * need `BaseClient` require it directly (`~/app/clients/BaseClient`), because it is a base class
 * to extend rather than a service to consume.
 */
const TextStream = require('./TextStream');
const toolUtils = require('./tools/util');

module.exports = {
  TextStream,
  ...toolUtils,
};
