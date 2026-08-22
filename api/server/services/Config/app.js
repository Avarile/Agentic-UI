/**
 * Resolves the application config — the `appConfig` / `req.config` object the whole app reads.
 *
 * `loadBaseConfig` builds the base layer (YAML config + formatted tool manifest + paths), and
 * `createAppConfigService` from `packages/api` layers per-role/group/user/tenant overrides on
 * top and caches the result.
 *
 * Design:
 * - Base config is built once and cached; override resolution happens per caller
 *   (`getAppConfig({ role, userId, tenantId })`), which is why `configMiddleware` resolves it
 *   per request rather than reading a module-level singleton.
 * - `invalidateConfigCaches(tenantId)` clears the app-config cache, the tool cache
 *   (`invalidateCachedTools`) and the MCP config cache (`clearMcpConfigCache`) together. Those
 *   three are derived from the same source, so flushing only one would leave a self-inconsistent
 *   view — this is why the admin config routes call it on every write.
 * - Tools are formatted at load time (`loadAndFormatTools`) so the manifest is parsed once per
 *   process, not per request.
 *
 * Connections:
 * - `loadCustomConfig.js` (YAML), `getCachedTools.js`, `server/services/start/tools.js`,
 *   `config/paths.js`
 * - consumers: `server/middleware/config/app.js`, `server/index.js`, admin config routes
 */
const { CacheKeys } = require('librechat-data-provider');
const { AppService, logger } = require('@librechat/data-schemas');
const { createAppConfigService, clearMcpConfigCache } = require('@librechat/api');
const { setCachedTools, invalidateCachedTools } = require('./getCachedTools');
const { loadAndFormatTools } = require('~/server/services/start/tools');
const loadCustomConfig = require('./loadCustomConfig');
const getLogStores = require('~/cache/getLogStores');
const paths = require('~/config/paths');
const db = require('~/models');

const loadBaseConfig = async () => {
  /** @type {TCustomConfig} */
  const config = (await loadCustomConfig()) ?? {};
  /** @type {Record<string, FunctionTool>} */
  const systemTools = loadAndFormatTools({
    adminFilter: config.filteredTools,
    adminIncluded: config.includedTools,
    directory: paths.structuredTools,
  });
  return AppService({ config, paths, systemTools });
};

const { getAppConfig, clearAppConfigCache, clearOverrideCache } = createAppConfigService({
  loadBaseConfig,
  setCachedTools,
  getCache: getLogStores,
  cacheKeys: CacheKeys,
  getApplicableConfigs: db.getApplicableConfigs,
  getUserPrincipals: db.getUserPrincipals,
});

/**
 * Invalidate all config-related caches after an admin config mutation.
 * Clears the base config, per-principal override caches, tool caches,
 * and the MCP config-source server cache.
 * @param {string} [tenantId] - Optional tenant ID to scope override cache clearing.
 */
async function invalidateConfigCaches(tenantId) {
  const results = await Promise.allSettled([
    clearAppConfigCache(),
    clearOverrideCache(tenantId),
    invalidateCachedTools({ invalidateGlobal: true }),
    clearMcpConfigCache(),
  ]);
  const labels = [
    'clearAppConfigCache',
    'clearOverrideCache',
    'invalidateCachedTools',
    'clearMcpConfigCache',
  ];
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === 'rejected') {
      logger.error(`[invalidateConfigCaches] ${labels[i]} failed:`, results[i].reason);
    }
  }
}

module.exports = {
  getAppConfig,
  clearAppConfigCache,
  invalidateConfigCaches,
};
