/**
 * Barrel for the RAG vector-store backend. Reached through `strategies.js`.
 */
const crud = require('./crud');

module.exports = {
  ...crud,
};
