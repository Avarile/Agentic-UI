/**
 * Returns the resolved endpoints configuration for the caller.
 *
 * Intentionally minimal — a one-line delegation to `getEndpointsConfig`, which owns resolution
 * and caching. Kept as a controller so the route file has no logic and the same resolution is
 * reachable from middleware (`buildEndpointOption`, `validateModel`).
 *
 * Connections: `server/services/Config/getEndpointsConfig.js`
 */
const { getEndpointsConfig } = require('~/server/services/Config');

async function endpointController(req, res) {
  const endpointsConfig = await getEndpointsConfig(req);
  res.send(JSON.stringify(endpointsConfig));
}

module.exports = endpointController;
