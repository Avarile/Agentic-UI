/**
 * The main agent chat endpoint: `POST /api/agents/chat` (plus `/resume` and `/:endpoint`).
 *
 * Middleware order is the contract — each layer assumes the previous one ran:
 * 1. `restoreResumeContext` — rebuilds request context for a HITL resume, whose body does not
 *    carry the full original request.
 * 2. `createMessageFilterPii` — PII redaction runs **first** among the content checks, so
 *    sensitive text is never forwarded to the external moderation API by the next step.
 * 3. `moderateText` — optional OpenAI moderation.
 * 4. `checkAgentAccess` — role permission to use agents at all.
 * 5. `checkAgentResourceAccess` (`canAccessAgentFromBody`) — ACL on the specific agent, read
 *    from the body rather than the path.
 * 6. `validateConvoAccess` — conversation ownership.
 * 7. `buildEndpointOption` — normalizes the body into `endpointOption`, applying model specs
 *    before the controller can be reached.
 *
 * Design: `/resume` is a separate route with its own controller because resuming a
 * human-in-the-loop checkpoint (tool approval or an ask-user answer) is not a new turn — it
 * continues an existing run. `/:endpoint` exists so an endpoint can be addressed by URL as
 * well as by body field.
 *
 * Connections:
 * - controllers: `server/controllers/agents/request.js`, `resume.js`
 * - client init: `server/services/Endpoints/agents/initialize.js`; titles via
 *   `services/Endpoints/agents/title.js`
 */
const express = require('express');
const { logger } = require('@librechat/data-schemas');
const {
  createMessageFilterPii,
  generateCheckAccess,
  skipAgentCheck,
  applyResumeContext,
  GenerationJobManager,
} = require('@librechat/api');
const { PermissionTypes, Permissions, PermissionBits } = require('librechat-data-provider');
const {
  moderateText,
  // validateModel,
  validateConvoAccess,
  buildEndpointOption,
  canAccessAgentFromBody,
} = require('~/server/middleware');
const { initializeClient } = require('~/server/services/Endpoints/agents');
const AgentController = require('~/server/controllers/agents/request');
const ResumeController = require('~/server/controllers/agents/resume');
const addTitle = require('~/server/services/Endpoints/agents/title');
const { getRoleByName } = require('~/models');

const router = express.Router();

const checkAgentAccess = generateCheckAccess({
  permissionType: PermissionTypes.AGENTS,
  permissions: [Permissions.USE],
  skipCheck: skipAgentCheck,
  getRoleByName,
});
const checkAgentResourceAccess = canAccessAgentFromBody({
  requiredPermission: PermissionBits.VIEW,
});

/**
 * Replay the paused turn's graph-determining config onto a resume request BEFORE the
 * rest of the chain (PII filter, agent-access, buildEndpointOption) reads it. The client
 * can't reliably re-send the ephemeral-agent config after a reload/cross-session, so the
 * server restores it from the pending action — the resume then rebuilds the SAME
 * agent/graph the run paused on (and a crafted resume can't swap the tool set). No-op for
 * every non-resume route.
 */
const restoreResumeContext = async (req, res, next) => {
  if (req.path !== '/resume') {
    return next();
  }
  try {
    const streamId = req.body?.conversationId;
    if (streamId) {
      const job = await GenerationJobManager.getJob(streamId);
      const resumeContext = job?.metadata?.pendingAction?.resumeContext;
      applyResumeContext(req.body, resumeContext);
      // Replay the paused turn's resolved model parameters. Ephemeral agents derive these
      // (temperature, max tokens, custom endpoint params) from the request body, which the
      // resume payload omits — without this the continuation runs with defaults. They're
      // scattered top-level fields (folded into model_parameters by buildOptions' rest
      // spread), not part of the RESUME_CONTEXT_KEYS allowlist, so merge them back here.
      // Authoritative: overwrites any client-supplied values with the captured set.
      // `model` is excluded — it's replayed via RESUME_CONTEXT_KEYS to the exact value the
      // resume fingerprint was pinned on, so overwriting it here could trip that check.
      const resumedModelParameters = resumeContext?.model_parameters;
      if (resumedModelParameters && typeof resumedModelParameters === 'object') {
        const { model: _replayedModel, ...replayParams } = resumedModelParameters;
        Object.assign(req.body, replayParams);
      }
    }
  } catch (err) {
    logger.warn('[agents/chat] Failed to restore resume context', err?.message ?? err);
  }
  next();
};

router.use(restoreResumeContext);
router.use(createMessageFilterPii({ getConfig: (req) => req.config?.messageFilter?.pii }));
router.use(moderateText);
router.use(checkAgentAccess);
router.use(checkAgentResourceAccess);
router.use(validateConvoAccess);
router.use(buildEndpointOption);

const controller = async (req, res, next) => {
  await AgentController(req, res, next, initializeClient, addTitle);
};

const resumeController = async (req, res, next) => {
  await ResumeController(req, res, next, initializeClient, addTitle);
};

/**
 * @route POST /resume
 * @desc Resume a generation paused for human-in-the-loop review (tool approval or
 *       ask-user answer). Shares this router's middleware so the agent/endpoint are
 *       reconstructed from the request exactly like a normal turn. Declared before
 *       `/:endpoint` so it is not captured as an ephemeral endpoint name.
 * @access Private
 * @returns {void}
 */
router.post('/resume', resumeController);

/**
 * @route POST / (regular endpoint)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/', controller);

/**
 * @route POST /:endpoint (ephemeral agents)
 * @desc Chat with an assistant
 * @access Public
 * @param {express.Request} req - The request object, containing the request data.
 * @param {express.Response} res - The response object, used to send back a response.
 * @returns {void}
 */
router.post('/:endpoint', controller);

module.exports = router;
