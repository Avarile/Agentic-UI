/**
 * Returns endpoint configuration and token/context limits for the UI.
 *
 * `/` resolves the endpoints config for the caller's role and tenant — hence the explicit
 * `requireJwtAuth` (noted inline). `/token-config` additionally needs `configMiddleware`
 * because it reads `req.config` for per-model context and pricing limits.
 *
 * Connections: `server/controllers/EndpointController.js`,
 * `server/controllers/TokenConfigController.js`
 */
const express = require('express');
const requireJwtAuth = require('~/server/middleware/requireJwtAuth');
const configMiddleware = require('~/server/middleware/config/app');
const endpointController = require('~/server/controllers/EndpointController');
const tokenConfigController = require('~/server/controllers/TokenConfigController');

const router = express.Router();
/** Auth required for role/tenant-scoped endpoint config resolution. */
router.get('/', requireJwtAuth, endpointController);
router.get('/token-config', requireJwtAuth, configMiddleware, tokenConfigController);

module.exports = router;
