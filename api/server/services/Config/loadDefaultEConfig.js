/**
 * Builds the default endpoints configuration (built-in providers and their display order).
 *
 * Reads the resolved credentials from `EndpointService`, honours `getEnabledEndpoints()` so
 * operators can disable providers, and awaits `loadAsyncEndpoints` for the ones whose
 * availability requires I/O (Google service key).
 *
 * Design: returns each endpoint with an `order` so the client renders providers in a stable,
 * operator-controllable sequence rather than in object-key order.
 *
 * Connections: `getEndpointsConfig.js`, `loadAsyncEndpoints.js`, `EndpointService.js`
 */
const { EModelEndpoint, getEnabledEndpoints } = require('librechat-data-provider');
const loadAsyncEndpoints = require('./loadAsyncEndpoints');
const { config } = require('./EndpointService');

/**
 * Load async endpoints and return a configuration object
 * @param {AppConfig} appConfig - The app configuration object
 * @returns {Promise<Object.<string, EndpointWithOrder>>} An object whose keys are endpoint names and values are objects that contain the endpoint configuration and an order.
 */
async function loadDefaultEndpointsConfig(appConfig) {
  const { assistants, azureAssistants, azureOpenAI } = config;

  const enabledEndpoints = getEnabledEndpoints();
  const { google } = enabledEndpoints.includes(EModelEndpoint.google)
    ? await loadAsyncEndpoints(appConfig)
    : { google: false };

  const endpointConfig = {
    [EModelEndpoint.openAI]: config[EModelEndpoint.openAI],
    [EModelEndpoint.agents]: config[EModelEndpoint.agents],
    [EModelEndpoint.assistants]: assistants,
    [EModelEndpoint.azureAssistants]: azureAssistants,
    [EModelEndpoint.azureOpenAI]: azureOpenAI,
    [EModelEndpoint.google]: google,
    [EModelEndpoint.anthropic]: config[EModelEndpoint.anthropic],
    [EModelEndpoint.bedrock]: config[EModelEndpoint.bedrock],
  };

  const orderedAndFilteredEndpoints = enabledEndpoints.reduce((config, key, index) => {
    if (endpointConfig[key]) {
      config[key] = { ...(endpointConfig[key] ?? {}), order: index };
    }
    return config;
  }, {});

  return orderedAndFilteredEndpoints;
}

module.exports = loadDefaultEndpointsConfig;
