/**
 * Endpoints-config service: what endpoints exist and which capabilities each supports.
 *
 * A thin binding — `createEndpointsConfigService` from `packages/api` is given `getAppConfig`
 * and `loadDefaultEndpointsConfig`, and returns `getEndpointsConfig` plus `checkCapability`.
 *
 * Design: `checkCapability` is exported alongside so callers test a capability through the same
 * resolved, cached config rather than re-deriving it from raw config — which is how the two
 * could otherwise disagree.
 *
 * Connections: `server/controllers/EndpointController.js`,
 * `server/middleware/buildEndpointOption.js`, `validateModel.js`,
 * `controllers/assistants/helpers.js`
 */
const { createEndpointsConfigService } = require('@librechat/api');
const loadDefaultEndpointsConfig = require('./loadDefaultEConfig');
const { getAppConfig } = require('./app');

const { getEndpointsConfig, checkCapability } = createEndpointsConfigService({
  getAppConfig,
  loadDefaultEndpointsConfig,
});

module.exports = { getEndpointsConfig, checkCapability };
