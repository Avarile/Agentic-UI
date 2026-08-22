/**
 * Boot-time setup of the OAuth reconnection manager for MCP servers.
 *
 * Wires the flow-state manager and the token CRUD methods into
 * `createOAuthReconnectionManager`, which then transparently refreshes expired MCP OAuth tokens
 * and re-establishes connections.
 *
 * Design: kept as its own tiny module (rather than folded into `initializeMCPs`) because it is a
 * distinct concern — token lifetime management, not server discovery — and `server/index.js`
 * runs both inside the same post-listen `runAsSystem` block where reconnect storms are expected
 * and tolerated (see the `unhandledRejection` note in `server/index.js`).
 *
 * Connections: `config/index.js`, `cache/getLogStores.js` (`CacheKeys.FLOWS`), token models
 */
const { logger } = require('@librechat/data-schemas');
const { CacheKeys } = require('librechat-data-provider');
const { createOAuthReconnectionManager, getFlowStateManager } = require('~/config');
const { findToken, updateToken, createToken, deleteTokens } = require('~/models');
const { getLogStores } = require('~/cache');

/**
 * Initialize OAuth reconnect manager
 */
async function initializeOAuthReconnectManager() {
  try {
    const flowManager = getFlowStateManager(getLogStores(CacheKeys.FLOWS));
    const tokenMethods = {
      findToken,
      updateToken,
      createToken,
      deleteTokens,
    };
    await createOAuthReconnectionManager(flowManager, tokenMethods);
    logger.info(`OAuth reconnect manager initialized successfully.`);
  } catch (error) {
    logger.error('Failed to initialize OAuth reconnect manager:', error);
  }
}

module.exports = initializeOAuthReconnectManager;
