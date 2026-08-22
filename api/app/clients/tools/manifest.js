/**
 * Loads `manifest.json` and derives lookup structures from it.
 *
 * Builds `manifestToolMap` (pluginKey -> tool) and `toolkits` (tools marked `toolkit: true`) in a
 * single pass, and exports `isAgentsOnlyTool`.
 *
 * Design: the map exists so tool lookups are O(1) instead of an `Array.find` over the manifest on
 * every resolution — tools are looked up per tool call. `isAgentsOnlyTool` marks tools that only
 * work inside the agents runtime (they need a pausable run, e.g. `ask_user_question`), which is
 * what lets `PluginController` exclude them from the legacy plugins endpoint instead of
 * advertising tools that always fail.
 *
 * Connections: `app/clients/tools/index.js`, `server/services/start/tools.js`,
 * `server/controllers/PluginController.js`, `controllers/assistants/v1.js`/`v2.js`
 */
const availableTools = require('./manifest.json');

/** @type {Record<string, TPlugin | undefined>} */
const manifestToolMap = {};

/** @type {Array<TPlugin>} */
const toolkits = [];

availableTools.forEach((tool) => {
  manifestToolMap[tool.pluginKey] = tool;
  if (tool.toolkit === true) {
    toolkits.push(tool);
  }
});

/**
 * Whether a tool (string pluginKey, or an OpenAI function-tool object) is
 * flagged `agentsOnly` in the manifest — usable only on the agents runtime
 * (e.g. `ask_user_question`, which pauses a LangGraph run via `interrupt()`).
 * The legacy assistants runtime executes tools with no run to pause and no
 * resume surface, so these must be rejected before assistant create/update —
 * the tools-dialog scoping alone doesn't stop a REST client or a stale saved
 * payload from posting the tool string directly.
 *
 * @param {string | { function?: { name?: string } } | undefined} tool
 * @returns {boolean}
 */
function isAgentsOnlyTool(tool) {
  const name = typeof tool === 'string' ? tool : tool?.function?.name;
  if (!name) {
    return false;
  }
  return manifestToolMap[name]?.agentsOnly === true;
}

module.exports = {
  toolkits,
  availableTools,
  manifestToolMap,
  isAgentsOnlyTool,
};
