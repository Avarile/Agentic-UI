/**
 * Barrel for the Assistants run layer: `handle` + `methods` helpers, `RunManager`,
 * `StreamRunManager`.
 *
 * The two managers are the polling and streaming implementations of the same job; callers pick
 * one based on whether the request streams.
 */
const handle = require('./handle');
const methods = require('./methods');
const RunManager = require('./RunManager');
const StreamRunManager = require('./StreamRunManager');

module.exports = {
  ...handle,
  ...methods,
  RunManager,
  StreamRunManager,
};
