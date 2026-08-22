/**
 * Tool discovery and invocation for agents: list tools, list calls, verify auth, call a tool.
 *
 * Design: `POST /:toolId/call` is the only route with a limiter (`toolCallLimiter`, 1/sec per
 * user) — a tool call can trigger code execution or a paid external API, while the listing
 * routes are cheap reads. `/:toolId/auth` lets the UI check whether a tool needs an OAuth
 * handshake before offering it, avoiding a failed call.
 *
 * Connections:
 * - controllers: `server/controllers/tools.js`, `server/controllers/PluginController.js`
 * - tool loading: `server/services/ToolService.js`
 */
const express = require('express');
const { callTool, verifyToolAuth, getToolCalls } = require('~/server/controllers/tools');
const { getAvailableTools } = require('~/server/controllers/PluginController');
const { toolCallLimiter } = require('~/server/middleware');

const router = express.Router();

/**
 * Get a list of available tools for agents.
 * @route GET /agents/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.get('/', getAvailableTools);

/**
 * Get a list of tool calls.
 * @route GET /agents/tools/calls
 * @returns {ToolCallData[]} 200 - application/json
 */
router.get('/calls', getToolCalls);

/**
 * Verify authentication for a specific tool
 * @route GET /agents/tools/:toolId/auth
 * @param {string} toolId - The ID of the tool to verify
 * @returns {{ authenticated?: boolean; message?: string }}
 */
router.get('/:toolId/auth', verifyToolAuth);

/**
 * Execute code for a specific tool
 * @route POST /agents/tools/:toolId/call
 * @param {string} toolId - The ID of the tool to execute
 * @param {object} req.body - Request body
 * @returns {object} Result of code execution
 */
router.post('/:toolId/call', toolCallLimiter, callTool);

module.exports = router;
