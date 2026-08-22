/**
 * Builds the agents `endpointOption` from the parsed request body.
 *
 * Design: `loadAgent` is started but **not awaited** — the promise is placed on the option
 * object. Loading an agent (with its tools, MCP servers and skills) is expensive, and the
 * caller can overlap it with validation and message building. Any endpoint that is not the
 * agents endpoint gets `Constants.EPHEMERAL_AGENT_ID`, so a plain provider chat runs through the
 * same agent machinery without requiring a stored agent.
 *
 * `removeNullishValues` keeps the option object free of undefined keys, which matters because it
 * is merged into request bodies sent to providers.
 *
 * Connections: called from `server/middleware/buildEndpointOption.js`; agent loading via
 * `packages/api` + `getMCPServerTools`
 */
const { logger } = require('@librechat/data-schemas');
const { loadAgent: loadAgentFn } = require('@librechat/api');
const { isAgentsEndpoint, removeNullishValues, Constants } = require('librechat-data-provider');
const { getMCPServerTools } = require('~/server/services/Config');
const db = require('~/models');

const loadAgent = (params) => loadAgentFn(params, { getAgent: db.getAgent, getMCPServerTools });

const buildOptions = (req, endpoint, parsedBody, endpointType) => {
  const { spec, iconURL, agent_id, chatProjectId, ...model_parameters } = parsedBody;
  const agentPromise = loadAgent({
    req,
    spec,
    agent_id: isAgentsEndpoint(endpoint) ? agent_id : Constants.EPHEMERAL_AGENT_ID,
    endpoint,
    model_parameters,
  }).catch((error) => {
    logger.error(`[/agents/:${agent_id}] Error retrieving agent during build options step`, error);
    return undefined;
  });

  /** @type {import('librechat-data-provider').TConversation | undefined} */
  const addedConvo = req.body?.addedConvo;

  return removeNullishValues({
    spec,
    iconURL,
    endpoint,
    agent_id,
    endpointType,
    chatProjectId,
    model_parameters,
    agent: agentPromise,
    addedConvo,
  });
};

module.exports = { buildOptions };
