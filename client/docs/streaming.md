# Streaming

The generation lifecycle, from a keypress to a persisted message — and back
again after a reload.

This is the hardest subsystem in the client. `hooks/SSE/useResumableSSE.ts` alone
is ~3,950 lines. Almost none of that complexity is transport; it is a consequence
of one capability.

## The capability that costs everything

**A generation is owned by the server, not by the tab that started it.** It
survives a reload, a network drop, a tab switch, a second tab. The client
*attaches* to a run and can re-attach later.

Everything below follows from that.

---

## The happy path

```
ChatForm
  └── useSubmitMessage                validation, draft handling
        └── useChatFunctions.ask      pick the parent message id, mint the
                                      optimistic user message + placeholder
                                      response, resolve the endpoint option
                                      (including any ephemeral agent), drain
                                      the pending queues (manual skills, quotes)
              └── store.submissionByIndex        ← handoff
                    └── useAdaptiveSSE           resumable, or plain SSE for
                                                 assistants endpoints
                          └── useEventHandlers   fold each event into state
                                └── components
```

The submission atom is the seam. `hooks/Chat/` writes it; `hooks/SSE/` reads it
and writes messages back. Clearing it tears the stream down.

`useAdaptiveSSE` always calls **both** implementations (Rules of Hooks) and
passes `null` to the inactive one — so every hook below must treat a null
submission as "do nothing".

### Optimistic messages are deliberately unhydrated

`ask` mints messages with `v4()` ids and no timestamps. That shape is not an
oversight; it is a signal. `data-provider/Messages/queries.ts` detects it
(`isUnhydratedMessage`: no `createdAt`/`updatedAt`, or an id ending in `_`) to
decide when *not* to trust a server response — see below.

A streaming message's id changes three times: client UUID → created-handler id →
server id. Nothing downstream may assume it is stable.

---

## Protocol negotiation

`data-provider/SSE/protocol.ts`. v2 changed what the control endpoints guarantee,
so the client must know which contract the server honours before it offers
features like same-id steer retry.

Negotiation is **fail-closed**: only an exact numeric echo of `2` enables v2. An
old server, a stripped field, the string `"2"`, or a future version all stay on
the legacy path. The negotiated version is carried *per generation*
(`activeGenerationProtocolVersionByConvoId`), not per session.

`postGenerationRequest` exists rather than reusing the shared Axios helper
because these routes need `request.authenticatedFetch`, which preserves the
protocol header across a transparent 401 token refresh. It re-shapes failures
into an Axios-like error so existing retry logic keeps working, and stamps
`ERR_NETWORK` on transport failures — `fetch` does not provide it, and the start
retry loop uses it to tell an *ambiguous* transport failure from a definite
rejection.

That distinction matters: a retry that is actually a duplicate start is much
worse than a slow one.

---

## Starting is a negotiation, not a request

`useResumableSSE` has separate budgets for separate failure modes:

```
MAX_RETRIES                            5
START_GENERATION_NETWORK_RETRIES       3       ambiguous transport failure
START_GENERATION_READINESS_TIMEOUT_MS  120000  SERVER_NOT_READY
SERVER_NOT_READY                               server is up, not ready to run
GENERATION_PREDECESSOR_MISMATCH                the run this one must follow
                                               isn't where the client thinks
```

They are distinct because the right response differs: wait for readiness, retry a
network blip a bounded number of times, and reconcile on a predecessor mismatch.

---

## Reconnection means reconciliation, not replacement

On re-attach the server sends its view of the run: content so far, pending
steers, applied steer ids. Local optimistic state may be *ahead of* or *behind*
it, so the client merges. `hooks/SSE/useResumeOnLoad.ts` is the entry point:

- it asks whether the conversation has a live stream (`fetchStreamStatus`, and
  `useActiveJobs` for the tab-independent answer);
- it rebuilds enough state for the normal streaming path to take over —
  submission, placeholder response, pending steers, branch sibling indexes;
- `hasSubmissionUserMessage` is the idempotence check: if the run's user message
  is already present, resume has happened and must not duplicate it.

**It must not run against a half-loaded cache.** `ChatView` gates it on
`!isLoading && !isFetching`, not just `!isLoading`, because navigation now
*invalidates* rather than removes the message cache — so a warm conversation
mounts with `isLoading: false` while its refetch is still in flight, and resuming
from that builds the wrong tail.

---

## Defending the message cache

`data-provider/Messages/queries.ts` handles a race that is unavoidable here: the
server's persisted list can legitimately lag what the client displays. Mid-stream
the assistant's reply exists in the cache as an unhydrated tail but may not be
persisted, so a refetch can return **fewer messages** than are on screen — or a
**404** for a conversation that is actively generating.

Trusting the response there wipes the reply out from under the user. Two
predicates encode when not to:

| Predicate | Keeps the cache when |
|---|---|
| `getStableMessages` | the response is a strict *prefix* of the cache, a stream is live, and the cache ends in a pending assistant tail |
| `shouldPreserveMessagesOnNotFound` | same conditions, for a 404 |

Both are narrow on purpose — prefix-only, streaming-only, pending-tail-only. A
response that is genuinely different (a fork, a deletion) still wins.

`hasActiveJob` consults the active-jobs cache so the guard also holds after a
reload, when nothing is streaming *in this tab* but the run continues. The cache
is re-read after the `await` and preferred if it changed, so a concurrent SSE
write is never clobbered by an in-flight fetch.

All three `refetchOn*` options default to false: refetching a conversation is
always an explicit decision.

---

## Aborting

Aborting is not one operation. Three things resolve independently and in any
order: the HTTP abort call, the SSE stream's own terminal event, and the
queue-drain signal.

Two specific hazards, both handled in `hooks/Chat/useChatHelpers.ts`:

**A late response landing on the wrong run.** An abort response can settle after
the pane has navigated to another conversation and armed its own interrupt. Every
clear is identity-guarded on `(conversationId, generationCreatedAt)`.
`hooks/Chat/abort.ts` is the minimal version of that guard: capture the
submission *before* the round trip, clear only if it is still current. Without it,
the abort response tears down the *next* run's stream before it attaches, and its
placeholder finalizes empty — a bug that presents as "the model returned nothing".

**A drain signal that never arrives.** Clearing submissions can tear down the SSE
before its aborted-final event is processed, and only that event writes the
run-end the queue drain consumes. `signalInterruptDrain` writes it from the abort
response instead. The write is idempotent: if the SSE final does arrive later, it
finds the flag consumed and drains nothing.

---

## Steering

Injecting a message into a run that is already generating.
`hooks/Chat/useSteering.ts` is ~1,500 lines because a steer has more states than
a message does, and every one is reconciled against the server.

```
sending             POST in flight
pending             server queued it, awaiting its injection boundary — the next
                    tool batch, or the next safe token boundary if `preempt` was armed
applied             on_steer_applied landed; the inline content part is now the
                    durable record and the chip disappears
failed              POST rejected; text stays recoverable
deliveryUncertain   transport failed with NO definitive server answer — the
                    durable enqueue may have committed
```

`deliveryUncertain` is the honest case. Under protocol v2 a same-id retry is safe
(the server dedupes); under v1 the destructive options stay hidden rather than
risk a double injection.

The recurring problem is **ordering across two transports**: the steer POST's ACK
and the `on_steer_applied` SSE event travel on different connections, so "applied"
can arrive *before* the ACK that would have created the local chip. The client
therefore records what has happened rather than assuming an order —
`appliedSteerIdsByConvoId` and `acceptedSteerClientIdsByConvoId` — and every path
consults those sets. This is also what stops a late POST error from resurrecting
a chip the user already cancelled.

Leftover steers at run end are **converted**, not dropped
(`useSteerConvert`): a steer that never reached its injection boundary becomes a
queued follow-up, which keeps the user's words visible and under their control.

---

## The follow-up queue

`hooks/Chat/useQueueDrain.ts`. Messages composed during a run are queued and
auto-sent one per completed run, driven by the one-shot `runEndByIndex` signal —
each drained message starts a normal turn whose own terminal event drains the
next, so the queue advances without a scheduler.

Aborts and errors do **not** drain (a failed run should not fire off the next
message) unless "interrupt & send" explicitly armed `drainAfterAbortByIndex`.

The non-obvious part is file-usage renewal. Queued messages carry
already-uploaded attachments, and the server sweeps an unused upload after a hold
window — so a message waiting behind a long run would lose its files. The hook
re-touches them every 30 minutes (well inside the shortest 24h server hold),
batching ids because the server caps how many one request may touch. Truncating
instead would leave everything past the first batch on its original hold.

---

## Event interpretation

`hooks/SSE/useEventHandlers.ts` holds one handler per event type, shared by both
transports — the transports differ, the semantics must not.

Each handler folds one event into the message cache, the conversation atom, **and
every paginated conversation list showing that conversation** (hence
`upsertConvoInAllQueries` / `updateConvoInAllQueries` /
`removeConvoFromAllQueries` from `utils/convos.ts`): a new conversation must
appear in the sidebar, and a title must update there, without refetching.

Specialized folders:

| Handler | Folds |
|---|---|
| `useContentHandler` | text and reasoning deltas — the hot path, kept allocation-light |
| `useStepHandler` | agent run steps: tool calls whose arguments stream as text fragments and must be accumulated before they are valid JSON, outputs arriving separately from their call, and steps that nest when a tool spawns a subagent |
| `useAttachmentHandler` | attachments, so a file the model produced renders when announced |
| `useUsageHandler` | token usage — accumulate then finalize (see [state.md](./state.md)) |

`buildCreatedInitialResponse` is exported because the resumable path must
reconstruct the same placeholder when re-attaching to a run whose `created` event
it never saw.

Subagent progress is folded incrementally (`utils/subagentContent.ts`): the atom
holds an aggregate, never the event log, so a subagent emitting thousands of
deltas costs what its rendered output costs.
