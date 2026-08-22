/**
 * Standalone model registry for entry points that need models without the full `db/index.js`.
 *
 * Design: `db/index.js` couples model registration to `indexSync` (which must load after
 * models exist). Scripts and tooling that only need the Mongoose models — and specifically
 * must *not* start MeiliSearch syncing — require this module instead.
 *
 * Connections:
 * - `createModels` from `packages/data-schemas` is the single definition point for schemas
 * - see `db/index.js` for the boot-time path that also wires index sync
 */
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const models = createModels(mongoose);

module.exports = { ...models };
