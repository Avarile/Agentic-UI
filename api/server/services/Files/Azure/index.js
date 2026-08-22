/**
 * Barrel for the Azure Blob Storage backend (`crud.js` + `images.js`). Reached through
 * `strategies.js`.
 */
const crud = require('./crud');
const images = require('./images');

module.exports = {
  ...crud,
  ...images,
};
