/**
 * Fetches models for operator-defined custom endpoints.
 *
 * Binding only: `createLoadConfigModels` from `packages/api` receives `getAppConfig`,
 * `db.getUserKeyValues` and `fetchModels`. The user-key lookup is what lets a custom endpoint
 * with a user-provided key enumerate models using that user's credential.
 *
 * Connections: `server/controllers/ModelController.js` (merged with `loadDefaultModels`)
 */
const { createLoadConfigModels, fetchModels } = require('@librechat/api');
const { getAppConfig } = require('./app');
const db = require('~/models');

const loadConfigModels = createLoadConfigModels({
  getAppConfig,
  getUserKeyValues: db.getUserKeyValues,
  fetchModels,
});

module.exports = loadConfigModels;
