# State

The client runs **two state libraries side by side**. That is a deliberate split,
not drift.

| | Recoil | Jotai |
|---|---|---|
| Holds | The conversation model | Preferences; high-frequency per-conversation values |
| Shape | Atom *families* keyed by pane index or conversation id, plus derived selectors | Small independent atoms and atom families |
| Why | `atomFamily`/`selectorFamily` and `useRecoilCallback` (read without subscribing) are what the chat machinery is built on | A write should re-render exactly one subscriber |
| Export style | Modules default-export an object, spread into one `store` namespace | Named exports, re-exported with `export *` |
| Import as | `store.isSubmittingFamily(index)` | `import { fontSizeAtom } from '~/store/fontSize'` |

A name is exported once, from one library. Reaching for `store.x` and finding
nothing usually means `x` is a Jotai atom that needs a named import.

---

## Keying conventions

```
*ByIndex, *Family      keyed by PANE index.  0 = primary chat, 1..n = the extra
                       panes of a multi-response ("add a model") run.
                       A slot on screen.

*ByConvoId             keyed by CONVERSATION id.  State that must survive that
                       slot being reused for a different conversation.
```

The distinction matters most for anything a run can outlive. `isSubmittingFamily`
is per-pane, because it describes what a slot is doing. `pendingSteersByConvoId`
and `queuedMessagesByConvoId` are per-conversation, because a user can navigate
away mid-run and their queued follow-ups must still be there when they come back.

`Constants.NEW_CONVO` acts as a template key. The user configures the new-chat
composer before a conversation id exists, and once the server assigns one, that
state is copied across (`useApplyNewAgentTemplate`). Without the copy, the first
message of every conversation would lose its tool toggles.

---

## `store/families.ts`

The largest module in the store, and the one to read first. A "conversation" is
not one value; it is a pane's conversation, its submission, its files, its draft
text, its queued and in-flight steers, its run-termination signals, and a dozen
derived selectors — each independently subscribable so a token arriving does not
re-render the composer.

Three patterns recur:

**Narrow selectors over wide reads.** `conversationIdByIndex`,
`conversationModelByIndex`, `conversationSpecByIndex`, `conversationAgentIdByIndex`
and friends exist so a consumer needing one field does not re-render when an
unrelated field changes on the same conversation object.

**Persistence as an atom effect.** `conversationByIndex`'s `onSet` is where the
last agent, spec, tools and endpoint settings reach localStorage, and where a
brand-new conversation's settings are reflected into the URL. Keeping it in the
effect means every writer persists identically and no call site can forget.

This is also why `routes/ChatRoute.tsx` is so careful about *when* it creates a
conversation: an early call writes half-loaded state, and the effect faithfully
persists it as the next session's defaults.

**Queues, not slots, for terminal signals.** `runEndsByIndex` and
`pendingRunEndsByConvoId` hold arrays even though consumers want one at a time
(the `runEndByIndex` selector preserves the simpler nullable API). A pane can
receive conversation A's final frame after the user has navigated to B and started
a run there; a single replaceable slot silently loses A.

The same reasoning produces the id-set atoms. `appliedSteerIdsByConvoId` records
steer ids whose `on_steer_applied` event has landed; `acceptedSteerClientIdsByConvoId`
records optimistic ids the server has acknowledged. The 202 ACK and the SSE event
travel on different connections and arrive in either order, so "already handled"
has to be *recorded*, not inferred. The applied set is capped rather than cleared,
because a late event can arrive after the run's final frame and must still be
recognized.

---

## Persistence

Four helpers, and the choice between them is a product decision:

| Helper | Library | Persists | Cross-tab | Use for |
|---|---|---|---|---|
| `atomWithLocalStorage` | Recoil | yes | yes | Any persisted Recoil atom |
| `createStorageAtom` | Jotai | yes | yes | User *preferences* — a font size should follow the user everywhere |
| `createTabIsolatedAtom` | Jotai | yes | **no** | Per-tab working state |
| `createStorageAtomWithEffect` | Jotai | yes | yes | Values that must also reach the DOM |

Tab isolation is achieved by omitting `subscribe` from the SyncStorage adapter —
no `storage` event listener, no propagation. It exists for a concrete reason:
every new chat shares the same `LAST_MCP_new` storage key, so ordinary cross-tab
sync would make one tab's MCP server picks appear in another tab's new chat. Same
for favourites, which are toggled as working state.

`atomWithLocalStorage` (Recoil) guarantees three things so no call site has to:

- a corrupt or unparseable stored value falls back to the default **and rewrites
  storage**, so a bad value cannot fail on every subsequent boot;
- an optional `normalizeSavedValue` runs on load and persists the normalized
  result — this is where migrations live (see the speech-engine atoms in
  `store/settings.ts`, which map historical `'openai'`/`'elevenlabs'` values onto
  the current browser/external split, so old installs need no migration script);
- `onSet` writes on every change.

Every Jotai accessor is `try`/`catch`ed and `typeof window` guarded, so a
private-mode browser or a quota-exceeded write degrades to the default rather
than throwing during render.

**Expiry.** Per-conversation preferences are written under conversation-scoped
keys, and conversations are unbounded — so without expiry localStorage grows for
the life of the browser profile. `utils/timestamps.ts` writes values with a
timestamp; `cleanupTimestampedStorage` sweeps them once at startup from
`useAppStartup`.

---

## Token usage

`store/usage.ts` is worth calling out because it separates three things that are
easy to conflate:

```
pendingUsageFamily      the in-flight response ONLY.  Accumulated from
                        on_token_usage events, flushed once at finalize.
                        The only live addend — which is what guarantees a
                        response is counted exactly once, even across a
                        stream reconnect.

per-message index       finalized usage.  Branch and conversation totals are
                        SUMMED from this rather than tracked, so they cannot
                        drift from the underlying records.

contextSnapshotFamily   the backend's authoritative context breakdown for the
                        latest run, anchored to its user message so staleness
                        is detectable.

snapshotsByAnchorFamily earlier generations' snapshots, retained so switching
                        to a branch generated earlier this session keeps its
                        granular rows instead of collapsing to coarse totals.
```

Split into many small atom families rather than one usage object because the write
frequency here is the highest in the app, and only the components that draw a
number should re-render.

---

## Lifetime caveat

Recoil does not garbage-collect `atomFamily` entries. A family entry persists for
the session after its consumer unmounts, so unmount handlers reset values to a
falsy default rather than removing keys. At realistic session scale (dozens of
artifacts, a few hundred visited conversations) the residual cost is one key and
one small value each. `store/artifacts.ts` documents the fallback if that ever
stops being true: fold the family into a single `Record` atom cleared on
conversation change.
