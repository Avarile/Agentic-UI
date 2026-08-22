/**
 * Root router for `/api/assistants`, mounting both API versions side by side.
 *
 * Applies `requireJwtAuth -> checkBan -> uaParser -> configMiddleware`, then mounts
 * `/v1` + `/v1/chat` and `/v2` + `/v2/chat`.
 *
 * Design: v1 and v2 are served simultaneously and permanently rather than migrated, because
 * they mirror OpenAI's own Assistants API versions — a deployment may have assistants created
 * under either, and the request/response shapes differ. Shared middleware is applied once here
 * so both versions get identical authentication and ban checks.
 *
 * Connections: `v1.js`, `v2.js`, `chatV1.js`, `chatV2.js`
 */
const express = require('express');
const { uaParser, checkBan, requireJwtAuth, configMiddleware } = require('~/server/middleware');
const router = express.Router();

const { v1 } = require('./v1');
const chatV1 = require('./chatV1');
const v2 = require('./v2');
const chatV2 = require('./chatV2');

router.use(requireJwtAuth);
router.use(checkBan);
router.use(uaParser);
router.use(configMiddleware);
router.use('/v1/', v1);
router.use('/v1/chat', chatV1);
router.use('/v2/', v2);
router.use('/v2/chat', chatV2);

module.exports = router;
