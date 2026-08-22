/**
 * Generation-protocol version negotiation between client and server.
 *
 * Two versions exist (`GENERATION_PROTOCOL_V1`, `V2`) governing the shape of the
 * generation-control envelopes (start, status, abort, steer, resume).
 *
 * Design — the safety rule is *lowest wins*:
 * - `getRequestedGenerationProtocol` reads the marker from every transport that can carry it
 *   (header, query, body) and, when they disagree, takes the lower value. A proxy or
 *   token-refresh path that drops one marker must never accidentally *upgrade* a legacy
 *   request into V2 semantics it cannot parse.
 * - `negotiateNewGenerationProtocol` = min(requested, server-supported).
 *   `negotiateExistingGenerationProtocol` = min(requested, the version the *job* was created
 *   under) — an in-flight generation cannot change protocol mid-run.
 * - `parseProtocolVersion` accepts number or string and returns `undefined` for anything else,
 *   so an unrecognized marker degrades to the default rather than throwing.
 * - `GENERATION_PROTOCOL_HEADER` is exported so both the header and the JSON body can carry the
 *   agreed version; the body is the client's fail-closed source of truth because auth-refresh
 *   adapters can strip headers.
 *
 * Connections:
 * - consumed by `server/routes/agents/index.js`, `controllers/agents/request.js`, `resume.js`,
 *   `steer.js`
 * - server capability is read from `GenerationJobManager` (`packages/api`)
 */
const GENERATION_PROTOCOL_HEADER = 'x-librechat-generation-protocol';
const GENERATION_PROTOCOL_V1 = 1;
const GENERATION_PROTOCOL_V2 = 2;

function parseProtocolVersion(value) {
  if (value === GENERATION_PROTOCOL_V1 || value === '1') {
    return GENERATION_PROTOCOL_V1;
  }
  if (value === GENERATION_PROTOCOL_V2 || value === '2') {
    return GENERATION_PROTOCOL_V2;
  }
  return undefined;
}

/**
 * Reads every transport carrying the negotiation marker. If multiple markers
 * disagree, the lower protocol wins; a proxy or token-refresh path dropping
 * one marker must never upgrade a legacy request accidentally.
 */
function getRequestedGenerationProtocol(req) {
  const advertised = [
    req?.body?.generationProtocolVersion,
    req?.query?.generationProtocolVersion,
    req?.headers?.[GENERATION_PROTOCOL_HEADER],
  ]
    .filter((value) => value != null)
    .map(parseProtocolVersion);

  if (advertised.length === 0 || advertised.some((value) => value == null)) {
    return GENERATION_PROTOCOL_V1;
  }
  return advertised.every((value) => value === GENERATION_PROTOCOL_V2)
    ? GENERATION_PROTOCOL_V2
    : GENERATION_PROTOCOL_V1;
}

/**
 * Redis state is shared by every replica, including an older binary during a
 * rolling deployment. Default it to the bridge-safe v1 protocol until an
 * operator completes the documented homogeneous-fleet cutover. In-memory
 * state cannot be touched by another process, so it can use v2 immediately.
 */
function getServerGenerationProtocol(manager) {
  const configured = parseProtocolVersion(process.env.GENERATION_PROTOCOL_VERSION);
  if (configured != null) {
    return configured;
  }
  return manager?.isRedis === true ? GENERATION_PROTOCOL_V1 : GENERATION_PROTOCOL_V2;
}

function getJobGenerationProtocol(job) {
  return parseProtocolVersion(job?.metadata?.generationProtocolVersion) ?? GENERATION_PROTOCOL_V1;
}

/** Selects an immutable protocol for a newly created generation. */
function negotiateNewGenerationProtocol(req, manager) {
  return Math.min(getRequestedGenerationProtocol(req), getServerGenerationProtocol(manager));
}

/**
 * Existing jobs keep the protocol they were created with. This is what makes
 * v1 jobs safe to finish after the fleet-wide v2 gate is enabled.
 */
function negotiateExistingGenerationProtocol(req, job) {
  return Math.min(getRequestedGenerationProtocol(req), getJobGenerationProtocol(job));
}

module.exports = {
  GENERATION_PROTOCOL_HEADER,
  GENERATION_PROTOCOL_V1,
  GENERATION_PROTOCOL_V2,
  getRequestedGenerationProtocol,
  getServerGenerationProtocol,
  getJobGenerationProtocol,
  negotiateNewGenerationProtocol,
  negotiateExistingGenerationProtocol,
};
