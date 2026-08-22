/**
 * Returns the available model list for the caller.
 *
 * Authenticated because the list is role- and tenant-scoped; the heavy lifting (fetching,
 * caching, filtering per endpoint) is in `server/controllers/ModelController.js`.
 */
const express = require('express');
const { modelController } = require('~/server/controllers/ModelController');
const { requireJwtAuth } = require('~/server/middleware/');

const router = express.Router();
router.get('/', requireJwtAuth, modelController);

module.exports = router;
