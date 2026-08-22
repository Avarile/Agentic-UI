/**
 * Thin re-export of `validateMessageReq` from `messageValidation.js`.
 *
 * Kept as its own module because it is the name routes and the middleware barrel import; the
 * implementation moved into the shared factory in `messageValidation.js`.
 */
const { validateMessageReq } = require('./messageValidation');

module.exports = validateMessageReq;
