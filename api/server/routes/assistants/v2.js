/**
 * Assistants API v2: same surface as v1, with v2 semantics where they differ.
 *
 * Design: deliberately *mixes* controllers — `create`/`patch` use the v2 implementations
 * (where the request shapes and tool-resource model changed), while `retrieve`, `delete`,
 * `list` and avatar upload reuse v1's, which are version-agnostic. Duplicating them would
 * create two copies to keep in sync for no behavioural gain.
 *
 * Connections: `server/controllers/assistants/v2.js` and `v1.js`
 */
const express = require('express');
const { configMiddleware } = require('~/server/middleware');
const v1 = require('~/server/controllers/assistants/v1');
const v2 = require('~/server/controllers/assistants/v2');
const documents = require('./documents');
const actions = require('./actions');
const tools = require('./tools');

const router = express.Router();
router.use(configMiddleware);

/**
 * Assistant actions route.
 * @route GET|POST /assistants/actions
 */
router.use('/actions', actions);

/**
 * Create an assistant.
 * @route GET /assistants/tools
 * @returns {TPlugin[]} 200 - application/json
 */
router.use('/tools', tools);

/**
 * Create an assistant.
 * @route GET /assistants/documents
 * @returns {AssistantDocument[]} 200 - application/json
 */
router.use('/documents', documents);

/**
 * Create an assistant.
 * @route POST /assistants
 * @param {AssistantCreateParams} req.body - The assistant creation parameters.
 * @returns {Assistant} 201 - success response - application/json
 */
router.post('/', v2.createAssistant);

/**
 * Retrieves an assistant.
 * @route GET /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.get('/:id', v1.retrieveAssistant);

/**
 * Modifies an assistant.
 * @route PATCH /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @param {AssistantUpdateParams} req.body - The assistant update parameters.
 * @returns {Assistant} 200 - success response - application/json
 */
router.patch('/:id', v2.patchAssistant);

/**
 * Deletes an assistant.
 * @route DELETE /assistants/:id
 * @param {string} req.params.id - Assistant identifier.
 * @returns {Assistant} 200 - success response - application/json
 */
router.delete('/:id', v1.deleteAssistant);

/**
 * Returns a list of assistants.
 * @route GET /assistants
 * @param {AssistantListParams} req.query - The assistant list parameters for pagination and sorting.
 * @returns {AssistantListResponse} 200 - success response - application/json
 */
router.get('/', v1.listAssistants);

/**
 * Uploads and updates an avatar for a specific assistant.
 * @route POST /avatar/:assistant_id
 * @param {string} req.params.assistant_id - The ID of the assistant.
 * @param {Express.Multer.File} req.file - The avatar image file.
 * @param {string} [req.body.metadata] - Optional metadata for the assistant's avatar.
 * @returns {Object} 200 - success response - application/json
 */
router.post('/avatar/:assistant_id', v1.uploadAssistantAvatar);

module.exports = router;
