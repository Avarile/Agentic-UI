/**
 * Barrel for the OpenAI-hosted file backend. Reached through `strategies.js`.
 */
const crud = require('./crud');

module.exports = {
  ...crud,
};
