/**
 * Shared API-key resolution for structured tools.
 *
 * `getApiKey(envVar, override)` reads the environment variable and throws a clear
 * "Missing X environment variable" error unless `override` is set — `override` is how a
 * user-provided (BYOK) key bypasses the env requirement.
 *
 * Design: one helper so every tool produces the same, actionable error message instead of failing
 * later with an opaque provider 401.
 */
const { getEnvironmentVariable } = require('@librechat/agents/langchain/utils/env');

function getApiKey(envVar, override) {
  const key = getEnvironmentVariable(envVar);
  if (!key && !override) {
    throw new Error(`Missing ${envVar} environment variable.`);
  }
  return key;
}

module.exports = {
  getApiKey,
};
