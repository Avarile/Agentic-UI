/**
 * Barrel for the Assistants thread layer, re-exporting `manage.js`.
 */
const manage = require('./manage');

module.exports = {
  ...manage,
};
