/**
 * Resolves the available model list, merging defaults with custom-endpoint models.
 *
 * Design: `loadDefaultModels` and `loadConfigModels` run in `Promise.all` — they are
 * independent reads (one from provider defaults, one from configured endpoints) and this sits
 * on a first-page-load path, so serializing them would add avoidable latency. Custom models are
 * spread *after* defaults, so operator configuration wins on key collision.
 *
 * Exports `loadModels` and `getModelsConfig` in addition to the HTTP handler, because
 * `validateModel` and `TokenConfigController` need the same resolved list without going through
 * HTTP.
 *
 * Connections: `server/services/Config/loadDefaultModels.js`, `loadConfigModels.js`
 */
const { logger } = require('@librechat/data-schemas');
const { loadDefaultModels, loadConfigModels } = require('~/server/services/Config');

const getModelsConfig = (req) => loadModels(req);

async function loadModels(req) {
  const [defaultModelsConfig, customModelsConfig] = await Promise.all([
    loadDefaultModels(req),
    loadConfigModels(req),
  ]);
  return { ...defaultModelsConfig, ...customModelsConfig };
}

async function modelController(req, res) {
  try {
    const modelConfig = await loadModels(req);
    res.send(modelConfig);
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).send({ error: error.message });
  }
}

module.exports = { modelController, loadModels, getModelsConfig };
