/**
 * Barrel for request-validation middleware. Currently exposes `validateConvoAccess`.
 */
const validateConvoAccess = require('./convoAccess');
module.exports = {
  validateConvoAccess,
};
