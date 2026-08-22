/**
 * Barrel for the image utilities: `convert`, `encode`, `resize`, and the `avatar` module.
 *
 * `avatar` is exported as a namespace rather than spread, because `resizeAvatar` is a distinct
 * operation from the general resize helpers and callers should be explicit about which they
 * mean.
 */
const avatar = require('./avatar');
const convert = require('./convert');
const encode = require('./encode');
const resize = require('./resize');

module.exports = {
  ...convert,
  ...encode,
  ...resize,
  avatar,
};
