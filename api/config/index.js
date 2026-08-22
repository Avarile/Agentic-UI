/**
 * Process-singleton accessors for MCP and OAuth-flow managers.
 *
 * Re-exports the `createInstance`/`getInstance` pairs of `MCPManager`,
 * `MCPServersRegistry` and `OAuthReconnectionManager` from `@librechat/api`, and owns two
 * lazily-built `FlowStateManager` singletons that arbitrate in-flight OAuth handshakes.
 *
 * Design: two *separate* flow managers on purpose. MCP OAuth uses the long
 * `mcpConfig.OAUTH_FLOW_TTL` so a user has time to click the auth button and finish the
 * browser round trip; Action (custom OpenAPI tool) OAuth uses a short 3-minute TTL so an
 * unclicked login does not pin a tool call open for the full MCP window. Both are memoized
 * in module scope because flow state must be shared across every request in the process.
 *
 * Also installs the `eventsource` polyfill on `global` — the MCP SSE transport expects a
 * browser-style `EventSource` to exist.
 *
 * Connections:
 * - consumers: `server/services/MCP.js`, `server/services/initializeMCPs.js`,
 *   `server/services/initializeOAuthReconnectManager.js`, `server/services/ActionService.js`,
 *   `server/controllers/mcp.js`, `server/routes/mcp.js`
 * - backing cache comes from `cache/getLogStores.js` (`CacheKeys.FLOWS`)
 */
const { EventSource } = require('eventsource');
const { Time } = require('librechat-data-provider');
const {
  mcpConfig,
  MCPManager,
  FlowStateManager,
  MCPServersRegistry,
  OAuthReconnectionManager,
} = require('@librechat/api');

global.EventSource = EventSource;

/** @type {FlowStateManager} */
let flowManager = null;
/** @type {FlowStateManager} */
let actionFlowManager = null;

/**
 * Flow manager for MCP OAuth flows. Uses the longer MCP OAuth TTL so the auth
 * button and flow state outlive the user-completion window.
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getFlowStateManager(flowsCache) {
  if (!flowManager) {
    flowManager = new FlowStateManager(flowsCache, {
      ttl: mcpConfig.OAUTH_FLOW_TTL,
      monitorTimeout: mcpConfig.OAUTH_HANDLING_TIMEOUT,
      retainedFailureTypes: ['mcp_oauth'],
    });
  }
  return flowManager;
}

/**
 * Flow manager for Action (custom tool) OAuth flows. Kept on the shorter TTL so an
 * unclicked action login does not leave the tool call waiting for the MCP OAuth window.
 * @param {Keyv} flowsCache
 * @returns {FlowStateManager}
 */
function getActionFlowStateManager(flowsCache) {
  if (!actionFlowManager) {
    actionFlowManager = new FlowStateManager(flowsCache, {
      ttl: Time.ONE_MINUTE * 3,
    });
  }
  return actionFlowManager;
}

module.exports = {
  createMCPServersRegistry: MCPServersRegistry.createInstance,
  getMCPServersRegistry: MCPServersRegistry.getInstance,
  createMCPManager: MCPManager.createInstance,
  getMCPManager: MCPManager.getInstance,
  getFlowStateManager,
  getActionFlowStateManager,
  createOAuthReconnectionManager: OAuthReconnectionManager.createInstance,
  getOAuthReconnectionManager: OAuthReconnectionManager.getInstance,
};
