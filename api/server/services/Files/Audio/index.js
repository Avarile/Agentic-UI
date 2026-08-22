/**
 * Barrel for the audio subsystem: STT, TTS, voice listing and speech config.
 *
 * Spreads the STT and TTS service modules so route handlers import handlers, not classes.
 */
const getCustomConfigSpeech = require('./getCustomConfigSpeech');
const TTSService = require('./TTSService');
const STTService = require('./STTService');
const getVoices = require('./getVoices');

module.exports = {
  getVoices,
  getCustomConfigSpeech,
  ...STTService,
  ...TTSService,
};
