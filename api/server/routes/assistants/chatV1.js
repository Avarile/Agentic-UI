/**
 * Assistants v1 chat endpoint and its abort route.
 *
 * Chain: `setHeaders` (opens the SSE stream) -> validators -> `buildEndpointOption` ->
 * controller. `POST /abort` is registered *first* and separately so an abort is never queued
 * behind the validation stack of the run it is trying to stop.
 *
 * Connections: controller `server/controllers/assistants/chatV1.js`; abort via
 * `server/middleware/abortMiddleware.js` -> `abortRun.js`
 */
const express = require('express');

const router = express.Router();
const {
  setHeaders,
  handleAbort,
  validateModel,
  buildEndpointOption,
} = require('~/server/middleware');
const validateConvoAccess = require('~/server/middleware/validate/convoAccess');
const validateAssistant = require('~/server/middleware/assistants/validate');
const chatController = require('~/server/controllers/assistants/chatV1');

router.post('/abort', handleAbort());

/**
 * @route POST /
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post(
  '/',
  validateModel,
  buildEndpointOption,
  validateAssistant,
  validateConvoAccess,
  setHeaders,
  chatController,
);

module.exports = router;
