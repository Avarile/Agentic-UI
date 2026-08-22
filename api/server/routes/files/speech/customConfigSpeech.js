/**
 * Returns the operator's speech configuration (`GET /config/get`) so the client knows which
 * STT/TTS providers and voices are available.
 *
 * Connections: `server/services/Files/Audio/getCustomConfigSpeech.js`
 */
const express = require('express');
const router = express.Router();

const { getCustomConfigSpeech } = require('~/server/services/Files/Audio');

router.get('/get', async (req, res) => {
  await getCustomConfigSpeech(req, res);
});

module.exports = router;
