/**
 * Exposes the available tool/plugin list for assistants. Single GET delegating to
 * `server/controllers/PluginController.js` — the same controller the agents tools route uses,
 * so both surfaces report one tool registry.
 */
const express = require('express');
const { getAvailableTools } = require('~/server/controllers/PluginController');

const router = express.Router();

router.get('/', getAvailableTools);

module.exports = router;
