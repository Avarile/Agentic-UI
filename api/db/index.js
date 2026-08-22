/**
 * Database entry point: connection factory plus the MeiliSearch index synchronizer.
 *
 * Design (load-order critical): `createModels(mongoose)` is invoked at module scope *before*
 * `./indexSync` is required. `indexSync.js` captures `mongoose.models.Message` and
 * `mongoose.models.Conversation` at import time, so if model registration had not already
 * happened those references would be undefined and every Meili sync would fail silently on
 * each boot. The inline comment in the file guards this ordering — do not reorder.
 *
 * Connections:
 * - schemas/models come from `packages/data-schemas` (`createModels`)
 * - `connectDb` -> `db/connect.js`; `indexSync` -> `db/indexSync.js`
 * - both are called by `server/index.js` during `startServer()`
 */
const mongoose = require('mongoose');
const { createModels } = require('@librechat/data-schemas');
const { connectDb } = require('./connect');

// createModels MUST run before requiring indexSync.
// indexSync.js captures mongoose.models.Message and mongoose.models.Conversation
// at module load time. If those models are not registered first, all MeiliSearch
// sync operations will silently fail on every startup.
createModels(mongoose);

const indexSync = require('./indexSync');

module.exports = { connectDb, indexSync };
