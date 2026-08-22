/**
 * Barrel for prompt construction: message formatting, summarization templates, truncation,
 * vision prompts and context handlers.
 *
 * `artifacts.js` and the `shadcn-docs/` modules are not re-exported — they are required directly
 * by the endpoint `build.js` files that need them, since artifact prompt generation is a
 * per-endpoint concern rather than a general prompt utility.
 */
const formatMessages = require('./formatMessages');
const summaryPrompts = require('./summaryPrompts');
const truncate = require('./truncate');
const createVisionPrompt = require('./createVisionPrompt');
const createContextHandlers = require('./createContextHandlers');

module.exports = {
  ...formatMessages,
  ...summaryPrompts,
  ...truncate,
  createVisionPrompt,
  createContextHandlers,
};
