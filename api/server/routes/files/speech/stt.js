/**
 * Speech-to-text endpoint. The audio multipart body is consumed by the multer route registered
 * in `server/routes/files/index.js` before this router runs; rate limits are applied by
 * `speech/index.js`.
 *
 * Connections: `server/services/Files/Audio/STTService.js`
 */
const express = require('express');
const { speechToText } = require('~/server/services/Files/Audio');

const router = express.Router();

router.post('/', speechToText);

module.exports = router;
