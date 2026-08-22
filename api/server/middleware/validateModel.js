/**
 * Validates that the requested model exists and is permitted for the endpoint.
 *
 * Design: the model string is validated *syntactically* first — length cap plus a strict
 * character pattern — before it is used in any lookup or forwarded upstream. It is then
 * trimmed and written back to `req.body.model` so downstream code works with the canonical
 * value rather than re-trimming.
 *
 * An unauthorized model request is a logged violation (`ILLEGAL_MODEL_REQUEST`), not just a
 * 400: repeatedly probing for models outside the allow-list is enumeration behaviour and
 * should count toward a ban.
 *
 * Connections:
 * - model list from `server/controllers/ModelController.js`; endpoint config from
 *   `server/services/Config`
 * - violations via `cache/logViolation.js`; runs after `buildEndpointOption`
 */
const { handleError } = require('@librechat/api');
const { ViolationTypes } = require('librechat-data-provider');
const { getModelsConfig } = require('~/server/controllers/ModelController');
const { getEndpointsConfig } = require('~/server/services/Config');
const { logViolation } = require('~/cache');

const MAX_MODEL_STRING_LENGTH = 256;
const MODEL_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_.:/@+-]*$/;

/**
 * Validates the model of the request.
 *
 * @async
 * @param {ServerRequest} req - The Express request object.
 * @param {Express.Response} res - The Express response object.
 * @param {Function} next - The Express next function.
 */
const validateModel = async (req, res, next) => {
  const { endpoint } = req.body;
  const rawModel = req.body.model;

  if (!rawModel || typeof rawModel !== 'string') {
    return handleError(res, { text: 'Model not provided' });
  }

  const model = rawModel.trim();
  if (!model || model.length > MAX_MODEL_STRING_LENGTH || !MODEL_PATTERN.test(model)) {
    return handleError(res, { text: 'Invalid model identifier' });
  }

  req.body.model = model;

  const endpointsConfig = await getEndpointsConfig(req);
  const endpointConfig = endpointsConfig?.[endpoint];

  if (endpointConfig?.userProvide) {
    return next();
  }

  const modelsConfig = await getModelsConfig(req);

  if (!modelsConfig) {
    return handleError(res, { text: 'Models not loaded' });
  }

  const availableModels = modelsConfig[endpoint];
  if (!availableModels) {
    return handleError(res, { text: 'Endpoint models not loaded' });
  }

  let validModel = !!availableModels.find((availableModel) => availableModel === model);

  if (validModel) {
    return next();
  }

  const { ILLEGAL_MODEL_REQ_SCORE: score = 1 } = process.env ?? {};

  const type = ViolationTypes.ILLEGAL_MODEL_REQUEST;
  const errorMessage = {
    type,
  };

  await logViolation(req, res, type, errorMessage, score);
  return handleError(res, { text: 'Illegal model request' });
};

module.exports = validateModel;
