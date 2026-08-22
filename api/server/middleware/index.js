/**
 * Barrel for the middleware layer — the single import point used by route modules.
 *
 * Design: spreads the sub-barrels (`abortMiddleware`, `validate`, `limiters`, `roles`,
 * `accessResources`) so a route can pull any middleware from one require. Note the deliberate
 * omission documented in `roles/index.js`: capability helpers are *not* re-exported here
 * because `roles/capabilities.js` depends on `~/models`, and this barrel is required by
 * modules that load while it is still initializing — the resulting circular require would
 * silently yield an empty exports object. Import capability helpers directly from
 * `~/server/middleware/roles/capabilities`.
 *
 * Connections:
 * - consumed by nearly every module under `server/routes/`
 */
const validatePasswordReset = require('./validatePasswordReset');
const setTwoFactorTempUser = require('./setTwoFactorTempUser');
const validateRegistration = require('./validateRegistration');
const buildEndpointOption = require('./buildEndpointOption');
const validateEmailLogin = require('./validateEmailLogin');
const validateMessageReq = require('./validateMessageReq');
const { prepareMessageRequestValidation, sendValidationResponse } = require('./messageValidation');
const checkDomainAllowed = require('./checkDomainAllowed');
const requireLocalAuth = require('./requireLocalAuth');
const canDeleteAccount = require('./canDeleteAccount');
const accessResources = require('./accessResources');
const requireLdapAuth = require('./requireLdapAuth');
const abortMiddleware = require('./abortMiddleware');
const checkInviteUser = require('./checkInviteUser');
const requireJwtAuth = require('./requireJwtAuth');
const { requireRumProxyAuth } = require('./requireJwtAuth');
const configMiddleware = require('./config/app');
const validateModel = require('./validateModel');
const moderateText = require('./moderateText');
const logHeaders = require('./logHeaders');
const setHeaders = require('./setHeaders');
const validate = require('./validate');
const limiters = require('./limiters');
const uaParser = require('./uaParser');
const checkBan = require('./checkBan');
const noIndex = require('./noIndex');
const roles = require('./roles');

module.exports = {
  ...abortMiddleware,
  ...validate,
  ...limiters,
  ...roles,
  ...accessResources,
  noIndex,
  checkBan,
  uaParser,
  setHeaders,
  logHeaders,
  moderateText,
  validateModel,
  requireJwtAuth,
  requireRumProxyAuth,
  setTwoFactorTempUser,
  checkInviteUser,
  requireLdapAuth,
  requireLocalAuth,
  canDeleteAccount,
  configMiddleware,
  checkDomainAllowed,
  validateMessageReq,
  sendValidationResponse,
  prepareMessageRequestValidation,
  buildEndpointOption,
  validateRegistration,
  validatePasswordReset,
  validateEmailLogin,
};
