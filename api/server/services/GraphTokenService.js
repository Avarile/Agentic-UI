/**
 * Thin wrapper over the generic OBO exchange for Microsoft Graph tokens.
 *
 * Exists purely to attach Graph-specific error context to a failed exchange — the generic
 * `exchangeOboToken` message ("identity provider rejected the OBO token exchange") is not enough
 * to tell a Graph scope/consent problem from any other OBO failure. Keeping it separate also
 * means Graph callers do not depend on the generic service's signature.
 *
 * Connections: `server/services/OboTokenService.js`; used by `GraphApiService.js`
 */
const { logger } = require('@librechat/data-schemas');
const { exchangeOboToken } = require('./OboTokenService');

/**
 * Get Microsoft Graph API token using the On-Behalf-Of flow.
 * Thin wrapper around the generic OBO exchange for Graph-specific error context.
 *
 * @param {Object} user - User object with OpenID information
 * @param {string} accessToken - Federated access token used as OBO assertion
 * @param {string} scopes - Graph API scopes for the token
 * @param {boolean} [fromCache=true] - Whether to try getting token from cache first
 * @returns {Promise<Object>} Graph API token response with access_token and expires_in
 */
async function getGraphApiToken(user, accessToken, scopes, fromCache = true) {
  try {
    return await exchangeOboToken(user, accessToken, scopes, fromCache);
  } catch (error) {
    logger.error(
      `[GraphTokenService] Failed to acquire Graph API token for user ${user.openidId}:`,
      error,
    );
    throw new Error(`Graph token acquisition failed: ${error.message}`);
  }
}

module.exports = {
  getGraphApiToken,
};
