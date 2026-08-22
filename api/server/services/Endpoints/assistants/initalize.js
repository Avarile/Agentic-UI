/**
 * Constructs the OpenAI client for the Assistants endpoint. (Filename typo is load-bearing —
 * it is the import path used by `index.js` and elsewhere.)
 *
 * Design: supports BYOK. When `ASSISTANTS_API_KEY`/`ASSISTANTS_BASE_URL` are marked
 * user-provided (`isUserProvided`), the user's stored values are read and
 * `checkUserKeyExpiry` rejects an expired key with a typed `ErrorTypes` error so the UI can
 * prompt for a new one instead of showing a provider error. `getProxyDispatcher` applies the
 * configured egress proxy.
 *
 * Connections: `server/controllers/assistants/helpers.js` (`getOpenAIClient`),
 * `server/middleware/abortRun.js`
 */
const OpenAI = require('openai');
const { isUserProvided, checkUserKeyExpiry, getProxyDispatcher } = require('@librechat/api');
const { ErrorTypes, EModelEndpoint } = require('librechat-data-provider');
const { getUserKeyValues, getUserKeyExpiry } = require('~/models');

const initializeClient = async ({ req, res, version }) => {
  const { PROXY, OPENAI_ORGANIZATION, ASSISTANTS_API_KEY, ASSISTANTS_BASE_URL } = process.env;

  const userProvidesKey = isUserProvided(ASSISTANTS_API_KEY);
  const userProvidesURL = isUserProvided(ASSISTANTS_BASE_URL);

  let userValues = null;
  if (userProvidesKey || userProvidesURL) {
    const expiresAt = await getUserKeyExpiry({
      userId: req.user.id,
      name: EModelEndpoint.assistants,
    });
    checkUserKeyExpiry(expiresAt, EModelEndpoint.assistants);
    userValues = await getUserKeyValues({ userId: req.user.id, name: EModelEndpoint.assistants });
  }

  let apiKey = userProvidesKey ? userValues.apiKey : ASSISTANTS_API_KEY;
  let baseURL = userProvidesURL ? userValues.baseURL : ASSISTANTS_BASE_URL;

  const opts = {
    defaultHeaders: {
      'OpenAI-Beta': `assistants=${version}`,
    },
  };

  if (userProvidesKey & !apiKey) {
    throw new Error(
      JSON.stringify({
        type: ErrorTypes.NO_USER_KEY,
      }),
    );
  }

  if (!apiKey) {
    throw new Error('Assistants API key not provided. Please provide it again.');
  }

  if (baseURL) {
    opts.baseURL = baseURL;
  }

  const proxyDispatcher = getProxyDispatcher(PROXY);
  if (proxyDispatcher) {
    opts.fetchOptions = {
      dispatcher: proxyDispatcher,
    };
  }

  if (OPENAI_ORGANIZATION) {
    opts.organization = OPENAI_ORGANIZATION;
  }

  /** @type {OpenAIClient} */
  const openai = new OpenAI({
    apiKey,
    ...opts,
  });

  openai.req = req;
  openai.res = res;

  return {
    openai,
    openAIApiKey: apiKey,
  };
};

module.exports = initializeClient;
