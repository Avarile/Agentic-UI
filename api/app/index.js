/**
 * Barrel re-exporting the legacy chat client layer under `app/`.
 *
 * Design: exists so consumers can `require('~/app')` without knowing whether a client lives
 * in `app/clients` or elsewhere in this tree. This layer is legacy — the non-agent
 * completion clients — and is being superseded by the agents pipeline under
 * `server/controllers/agents/`. Prefer adding new capability there, not here.
 *
 * Connections:
 * - `app/clients/index.js` -> `BaseClient`, `OllamaClient`, `TextStream`, prompt helpers
 */
const clients = require('./clients');

module.exports = {
  ...clients,
};
