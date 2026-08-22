/**
 * The tool catalog cache — shared, generation-versioned storage for available tools.
 *
 * Constructs an `MCPCatalogStore` (from `packages/api`) over Redis when available, falling back
 * to the Keyv `TOOL_CACHE` store.
 *
 * Design:
 * - Tool catalogs must be shared across replicas: an MCP server's tool list is discovered by
 *   whichever process connected to it, and every process must serve the same catalog.
 * - Redis is used directly (`ioredisClient`, `evalKeyvRedisScript`) rather than through Keyv for
 *   the read-modify-write paths, because publishing a catalog needs atomicity that a plain
 *   get/set cannot provide.
 * - `waitForRedis` defers the first access until the client is ready, so a boot-time publish
 *   does not silently no-op.
 * - `userConnectionIdleTimeout` ties per-user MCP connection catalogs to the same idle timeout
 *   the connections use, so a catalog does not outlive its connection.
 * - `ToolCacheKeys` is re-exported so callers never hand-build cache keys.
 *
 * Connections:
 * - `server/services/Config/mcp.js`, `services/initializeMCPs.js`,
 *   `controllers/PluginController.js`, `services/Config/app.js` (invalidation)
 */
const { CacheKeys } = require('librechat-data-provider');
const {
  cacheConfig,
  evalKeyvRedisScript,
  ioredisClient,
  keyvRedisClient,
  waitForKeyvRedisClient,
  mcpConfig,
  ToolCacheKeys,
  createMCPCatalogStore,
} = require('@librechat/api');
const getLogStores = require('~/cache/getLogStores');

const store = createMCPCatalogStore({
  cacheConfig,
  ioredisClient,
  keyvRedisClient: keyvRedisClient ? { eval: evalKeyvRedisScript } : null,
  waitForRedis: waitForKeyvRedisClient,
  userConnectionIdleTimeout: mcpConfig.USER_CONNECTION_IDLE_TIMEOUT,
  getCache: () => getLogStores(CacheKeys.TOOL_CACHE),
});

module.exports = { ToolCacheKeys, ...store };
