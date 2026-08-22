/**
 * Re-export of the MCP per-request context helpers from `packages/api`.
 *
 * Exists so app code imports MCP request-context functions from a stable local path while the
 * implementation (an async-local store binding an MCP connection to the request that opened it,
 * plus its cleanup) stays in TypeScript in `packages/api`.
 *
 * Connections: used by `server/services/MCP.js` and the MCP routes/controllers
 */
const {
  cleanupMCPRequestContextForReq,
  cleanupMCPRequestContext,
  createMCPRequestContext,
  getMCPRequestContext,
} = require('@librechat/api');

module.exports = {
  cleanupMCPRequestContextForReq,
  cleanupMCPRequestContext,
  createMCPRequestContext,
  getMCPRequestContext,
};
