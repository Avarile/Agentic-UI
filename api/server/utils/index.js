/**
 * Barrel for the server utility layer: text/stream helpers, email, the leaky-bucket queue, file helpers.
 *
 * `fallback.js`, `staticCache.js` and `getFileStrategy.js` are deliberately not re-exported —
 * they are single-consumer modules required directly by `server/index.js` and the file services,
 * and adding them here would only widen the surface.
 */
const handleText = require('./handleText');
const sendEmail = require('./sendEmail');
const queue = require('./queue');
const files = require('./files');

module.exports = {
  ...handleText,
  sendEmail,
  ...files,
  ...queue,
};
