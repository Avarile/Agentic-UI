/**
 * MCP tool-cache service: publishing and reading MCP server tool catalogs.
 *
 * Binds `createMCPToolCacheService` from `packages/api` to the cache primitives in
 * `getCachedTools.js` and the `MCPServersRegistry`.
 *
 * Design: the generation/revision functions
 * (`getMCPToolsCacheGeneration`, `renewMCPToolsCacheGeneration`,
 * `getNextAppToolsPublicationRevision`) plus `setCachedToolsIfCurrent` implement
 * compare-and-set publication. Multiple replicas may discover tool changes concurrently; without
 * a generation check a slower replica could overwrite a newer catalog with a stale one, and
 * clients would silently see disappearing tools.
 *
 * Connections: `server/services/initializeMCPs.js`, `services/MCP.js`, `Config/getCachedTools.js`
 */
const { createMCPToolCacheService, MCPServersRegistry } = require('@librechat/api');
const {
  getCachedTools,
  updateCachedGlobalTools,
  setCachedToolsWithinGlobalLock,
  getCachedAppServerTools,
  setCachedAppServerTools,
  setCachedToolsIfCurrent,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
} = require('./getCachedTools');

const {
  syncStaticTools,
  mergeAppTools,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPServerTools,
} = createMCPToolCacheService({
  getCachedTools,
  updateCachedGlobalTools,
  setCachedTools: setCachedToolsWithinGlobalLock,
  setCachedToolsIfCurrent,
  getCachedAppServerTools,
  setCachedAppServerTools,
  getServerConfig: (serverName, userId) =>
    MCPServersRegistry.getInstance().getServerConfig(serverName, userId),
  getAllServerConfigs: () => MCPServersRegistry.getInstance().getAllServerConfigs(),
  isAppServerConfig: (serverName, effectiveConfig) =>
    MCPServersRegistry.getInstance().isAppServerConfig(serverName, effectiveConfig),
});

module.exports = {
  syncStaticTools,
  mergeAppTools,
  getMCPServerTools,
  cacheMCPServerTools,
  updateMCPServerTools,
  getMCPToolsCacheGeneration,
  renewMCPToolsCacheGeneration,
  getNextAppToolsPublicationRevision,
};
