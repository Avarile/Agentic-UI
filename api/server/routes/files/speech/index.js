/**
 * Speech router: mounts STT, TTS and the speech config endpoint under `/api/files/speech`.
 *
 * Design: STT and TTS get *separate* IP+user rate limiters, built here at mount time from
 * `createSTTLimiters`/`createTTSLimiters`. Both call paid upstream APIs, and a transcription
 * burst must not exhaust the synthesis budget.
 *
 * Connections: `stt.js`, `tts.js`, `customConfigSpeech.js`;
 * service `server/services/Files/Audio/`
 */
const express = require('express');
const { createTTSLimiters, createSTTLimiters } = require('~/server/middleware');

const stt = require('./stt');
const tts = require('./tts');
const customConfigSpeech = require('./customConfigSpeech');

const router = express.Router();

const { sttIpLimiter, sttUserLimiter } = createSTTLimiters();
const { ttsIpLimiter, ttsUserLimiter } = createTTSLimiters();
router.use('/stt', sttIpLimiter, sttUserLimiter, stt);
router.use('/tts', ttsIpLimiter, ttsUserLimiter, tts);

router.use('/config', customConfigSpeech);

module.exports = router;
