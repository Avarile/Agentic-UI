/**
 * Barrel for the code-interpreter file layer, re-exporting `crud.js`.
 */
const crud = require('./crud');

module.exports = {
  ...crud,
};
