/**
 * Barrel for the local-filesystem backend (`crud.js` + `images.js`). Consumed through
 * `strategies.js`, not imported directly by feature code.
 */
const images = require('./images');
const crud = require('./crud');

module.exports = {
  ...crud,
  ...images,
};
