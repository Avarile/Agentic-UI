/**
 * Barrel for the configuration layer — the import point for everything config-related.
 *
 * Spreads the app-config accessors, the tool cache, MCP tool cache, and endpoints-config
 * service so callers write `require('~/server/services/Config')` and do not need to know which
 * file owns a given function.
 *
 * Design: `EndpointService` is exported as just `config` (the resolved per-endpoint
 * credential/URL table) because that is the only thing outside this directory needs from it.
 *
 * Connections: consumed by controllers, middleware (`config/app.js`), strategies and
 * `server/index.js`
 */
const appConfig = require('./app');
const mcpToolsCache = require('./mcp');
const { config } = require('./EndpointService');
const getCachedTools = require('./getCachedTools');
const loadCustomConfig = require('./loadCustomConfig');
const loadConfigModels = require('./loadConfigModels');
const loadDefaultModels = require('./loadDefaultModels');
const getEndpointsConfig = require('./getEndpointsConfig');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');

module.exports = {
  config,
  loadCustomConfig,
  loadConfigModels,
  loadDefaultModels,
  loadAsyncEndpoints,
  ...appConfig,
  ...getCachedTools,
  ...mcpToolsCache,
  ...getEndpointsConfig,
};
