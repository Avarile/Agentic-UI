/**
 * Resolves a tool's required credentials for a user.
 *
 * `loadAuthValues({ userId, authFields, optional, throwError })` reads each field from the
 * user's stored plugin auth and returns them as an object.
 *
 * Design: `authFields` entries may be `"A||B"` alternatives (try A, fall back to B), which is how
 * a tool accepts either of two env/key names. The `optional` set marks fields whose absence is
 * acceptable, and `throwError` lets a capability probe get `null` where an executing tool wants
 * an exception. Values are decrypted per call and never cached here, so a revoked credential
 * takes effect immediately.
 *
 * Connections: `server/services/PluginService.js`; consumers: `services/ToolService.js`,
 * `controllers/tools.js`, `app/clients/tools/util/handleTools.js`
 */
const { AuthType } = require('librechat-data-provider');
const { getUserPluginAuthValue } = require('~/server/services/PluginService');

/**
 *
 * @param {Object} params
 * @param {string} params.userId
 * @param {string[]} params.authFields
 * @param {Set<string>} [params.optional]
 * @param {boolean} [params.throwError]
 * @returns
 */
const loadAuthValues = async ({ userId, authFields, optional, throwError = true }) => {
  let authValues = {};

  /**
   * Finds the first non-empty value for the given authentication field, supporting alternate fields.
   * @param {string[]} fields Array of strings representing the authentication fields. Supports alternate fields delimited by "||".
   * @returns {Promise<{ authField: string, authValue: string} | null>} An object containing the authentication field and value, or null if not found.
   */
  const findAuthValue = async (fields) => {
    for (const field of fields) {
      const envValue = process.env[field];
      if (envValue && envValue.trim() !== '' && envValue !== AuthType.USER_PROVIDED) {
        return { authField: field, authValue: envValue };
      }
      let value;
      try {
        value = await getUserPluginAuthValue(userId, field, throwError);
      } catch (err) {
        if (optional && optional.has(field)) {
          return { authField: field, authValue: undefined };
        }
        if (field === fields[fields.length - 1]) {
          throw err;
        }
      }
      if (value) {
        return { authField: field, authValue: value };
      }
    }
    return null;
  };

  for (let authField of authFields) {
    const fields = authField.split('||');
    const result = await findAuthValue(fields);
    if (result) {
      authValues[result.authField] = result.authValue;
    }
  }

  return authValues;
};

module.exports = {
  loadAuthValues,
};
