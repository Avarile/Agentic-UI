# Client Architecture

The web UI: a React 18 SPA built with Vite, served from `/client`, talking to the
Express backend in `/api`.

Roughly 1,300 source files and 177k lines. This document is the map. Every source
file also carries a header comment stating its purpose, why it is shaped the way
it is, and what it connects to — read the file's header before reading the file.

Deep dives live in [`docs/`](./docs):

| Document | Covers |
|---|---|
| [`docs/state.md`](./docs/state.md) | The Recoil/Jotai split, keying conventions, persistence |
| [`docs/streaming.md`](./docs/streaming.md) | The generation lifecycle: send → stream → resume → abort |
| [`docs/rendering.md`](./docs/rendering.md) | The message tree and why it renders the way it does |

---

## 1. The layers

Nine directories under `src/`, in dependency order. Each layer may import from
the layers above it in this table, and should not import downward.

| Layer | Directory | Files | Owns |
|---|---:|---:|---|
| Pure functions | `utils/` | 78 | Tree building, cache reconciliation, parsing, sanitizing, formatting. React-free. |
| Types | `common/`, `@types/` | 11 | Client-only types. Wire types come from `librechat-data-provider`. |
| State | `store/` | 27 | Atoms and selectors. Values, not orchestration. |
| Data access | `data-provider/` | 46 | React Query hooks: keys, staleness, invalidation, optimistic updates. |
| Behaviour | `hooks/` | 218 | Everything that coordinates state, queries and effects. |
| Contexts | `Providers/` | 28 | The seams that share behaviour down a subtree. |
| Components | `components/` | 861 | Rendering. |
| Routes | `routes/` | 11 | URL → state resolution and the auth boundary. |
| Cross-cutting | `a11y/`, `lib/`, `locales/` | 16 | Live regions, RUM, i18n. |

Imports use the `~/` alias for `src/` (configured in both `vite.config.ts` and
`tsconfig.json`), so `~/hooks`, `~/store`, `~/utils` are the canonical forms.
Relative imports are for siblings within a feature directory.

### The load-bearing rule

**Atoms are dumb; hooks orchestrate.** `store/` holds values and derived
selectors and nothing else. Every non-trivial interaction between two atoms, or
between an atom and a query, is a hook in `hooks/`. This is why `hooks/` has 218
files and `store/` has 27, and it is what makes the state layer readable at all.

If you find yourself wanting a selector that fetches, writes, or sequences —
that is a hook.

---

## 2. Boot sequence

```
index.html
  └── lib/rum/bootstrap.js        instrumentation before the bundle, so a
                                  failure that prevents React mounting is caught
  └── main.jsx
        await initializeI18n()    render is blocked on this — painting early
                                  flashes raw com_* keys
        ApiErrorBoundaryProvider  the 401 sink, provided ABOVE App because App
                                  creates the QueryClient that reports to it
        └── App.jsx
              QueryClientProvider   server cache
              RecoilRoot            client state
              LiveAnnouncer         a11y live regions
              ThemeProvider         paints the CSS variables everything styles against
              Toast / DndProvider   cross-cutting services
              └── RouterProvider  → routes/index.tsx
```

Two boot details that are easy to break:

- `networkMode: 'always'` on the QueryClient. LibreChat is routinely
  self-hosted, and `navigator.onLine` reports false on a machine with no WiFi
  whose localhost backend is perfectly reachable. The default mode pauses every
  query in that situation.
- The theme is spread in **conditionally**. `initialTheme`/`themeRGB` are passed
  only when a build-time env theme exists, so on a default deployment the user's
  stored preference stays authoritative instead of being overwritten each boot.

---

## 3. Routing and the auth boundary

`routes/index.tsx` expresses authentication as *structure*, not as conditionals.
Three sibling trees, in decreasing publicness:

```
share/:shareId, oauth/*     public — no AuthContextProvider above them at all
/  (StartupLayout)          pre-auth forms: register, password reset
AuthLayout                  the only subtree with a session
  ├── LoginLayout           login, 2FA
  ├── dashboardRoutes       legacy /d/* redirects
  └── Root                  the authenticated app shell
        ├── ChatRoute       /c/:conversationId?
        ├── Search          /search
        └── lazy routes     /prompts/:id, /skills/*, /projects/*, /agents/*
```

`AuthContextProvider` lives on a route element rather than in `App.jsx`. That is
what makes the public routes genuinely public: they never mount the session
machinery and never provoke a token refresh. Anything rendered from the share
route must therefore tolerate the absence of auth and chat-form context — which
is why `Providers/CustomFormContext` exposes a non-throwing
`useOptionalCustomFormContext`.

`routes/Root.tsx` is the authenticated shell. It hosts the app-wide singletons
exactly once: the file, assistants and agents maps (built here, pushed down as
context so the whole tree shares one mapping pass), the banner, the sidebar,
keyboard shortcuts, and the System Core dialog.

`routes/ChatRoute.tsx` is the most timing-sensitive file in the client. It
reconciles startup config, endpoints, models, the conversation, roles, the agent
catalogue and an optional `?projectId` scope before it may call
`newConversation()` even once — because that call writes conversation state which
an atom effect then persists to localStorage. Calling it early does not just
render wrong; it poisons the stored defaults for the next session.

---

## 4. Data flow

### Reading

```
librechat-data-provider   endpoint URLs, wire types, dataService  (packages/)
        ↓
data-provider/            React Query hooks: keys, staleness, invalidation
        ↓
hooks/                    derivation, coordination
        ↓
Providers/                shared down a subtree
        ↓
components/               render
```

`data-provider/` is *not* the same thing as the `librechat-data-provider`
package. The package owns the wire contract. This directory owns what the package
cannot know: cache keys, invalidation after a mutation, polling and backoff, and
query gating on auth or permission.

Layout convention: new features get a directory
(`Feature/queries.ts`, `Feature/mutations.ts`, `Feature/index.ts`). The flat
files at the top level — `queries.ts`, `mutations.ts`, `prompts.ts`, `roles.ts`,
`tags.ts`, `Favorites.ts` — predate that rule and still hold conversations,
presets, assistants, actions and speech. **Add to a directory, not to the flat
files.**

### Writing (a message)

```
ChatForm                      composer input
  → useSubmitMessage          validation, draft clearing
  → useChatFunctions.ask      builds the optimistic user message + placeholder,
                              resolves the endpoint option, drains pending
                              queues (manual skills, quotes)
  → store.submissionByIndex   ← the handoff point
  → useAdaptiveSSE            picks resumable or plain SSE
  → useEventHandlers          folds events into the message cache, conversation
                              atom, and every paginated list showing it
  → components render
```

The submission atom is the seam between send and receive. `hooks/Chat/` writes
it; `hooks/SSE/` reads it and writes messages back. See
[`docs/streaming.md`](./docs/streaming.md).

---

## 5. Conventions worth knowing before you read code

**Keying.** `*ByIndex` / `*Family` atoms are keyed by *pane index* — 0 is the
primary chat, 1..n are the extra panes of a multi-response run. `*ByConvoId`
atoms are keyed by conversation id, for state that must survive a pane being
reused for a different conversation.

**"Unknown" is not "empty".** Several contexts default to `undefined` rather
than `{}` — most importantly `AgentsMapContext`. Consumers ask "is this id in the
map?" to decide whether a stored selection is still valid, so an empty-object
default reads as a *loaded but empty* catalogue and silently discards every valid
stored pick. The same distinction drives the use of `isNotFoundError` throughout:
a 404 means gone, a 500 means try again, and the two must not collapse.

**Terminal signals are queues, not slots.** `runEndsByIndex` and
`pendingRunEndsByConvoId` hold arrays. A pane can receive conversation A's final
frame *after* the user has navigated to B and started a run there; a single
replaceable slot loses A. For the same reason, "already handled" is recorded
rather than inferred (`appliedSteerIdsByConvoId`) — a 202 ACK and its SSE event
travel on different connections and arrive in either order.

**Identity guards on async settlement.** Anything that resolves after an await
and then writes state is fenced on `(conversationId, generationCreatedAt)`. See
`hooks/Chat/abort.ts` for the canonical, minimal example.

**Two message renderers under two directories.** `components/Chat/Messages/` is
the chat-specific row and tree machinery. `components/Messages/` is the
chat-*agnostic* rendering primitives — code blocks, mermaid, markdown container,
the standard content renderer — reused by the share route, search results and
the artifacts panel, none of which have a live chat around them.

**Localization is mandatory.** All user-facing text goes through
`useLocalize()`, whose key type is generated from the English catalogue, so a
typo is a compile error. Only `locales/en/translation.json` is hand-edited.

**Styling composes.** Reach for a `@librechat/client` primitive and a semantic
theme role before adding feature-local classes. The class-string constants in
`utils/index.ts` (`cardStyle`, `defaultTextProps`) are legacy; a long tail of
components still imports them, but new work should not.

**Config HTML is untrusted.** Admin-authored markup — banner messages, agent
descriptions, welcome text, terms — passes through
`utils/configHtml.ts`'s sanitizer with an explicit, narrow allowlist per call
site. Widening an allowlist widens what any config on any deployment can inject.

---

## 6. Where to add things

| You want to… | Put it… |
|---|---|
| Call a new endpoint | `data-provider/<Feature>/queries.ts` or `mutations.ts`, re-exported through `<Feature>/index.ts` then `data-provider/index.ts` |
| Hold new state | `store/` — a value or selector only. Recoil for conversation-shaped state, Jotai for preferences and high-frequency per-conversation values |
| Coordinate state, queries or effects | `hooks/<Domain>/` — the folder named after the thing being manipulated |
| Share behaviour down a subtree | `Providers/`, typed as `ReturnType<typeof theHook>` so it cannot drift |
| Add a pure decision | `utils/` — and unit-test it there rather than through a component |
| Add UI | the feature directory under `components/`; a genuinely new primitive goes in `@librechat/client`, not `components/ui/` |
| Add a route | `routes/index.tsx`, under the correct auth subtree; use `lazy:` if it pulls a heavy dependency tree |
| Add user-facing text | `locales/en/translation.json` with a `com_*` key, read via `useLocalize()` |

---

## 7. Performance model

The message list is the expensive subtree, and most of the non-obvious code in
the client exists to keep it cheap during streaming. The four mechanisms:

1. **Block-level memoization** (`MarkdownBlocks.tsx`). A markdown document is
   split into independently memoized blocks, so a long answer costs the same per
   token as a short one instead of re-parsing the whole document each time.
2. **Field-level comparators** (`areMessageRowPropsEqual`). The message object is
   a fresh reference on every streamed write, so shallow equality never bails.
3. **Narrow subscriptions.** `MessagesViewContext` re-exports only the fields the
   list needs, in four separately memoized clusters. `useLatestMessage` is split
   into three hooks so a consumer that needs only an id does not subscribe to a
   message. `EditorContext` is split so a keystroke does not re-render a toolbar.
4. **Isolated re-render hosts.** Components exist purely to confine a
   subscription: `ScrollButton` inside `MessagesView`, `SidebarChatProvider`
   inside `UnifiedSidebar`. Recoil subscriptions do not propagate to parents,
   which is what makes this work.

See [`docs/rendering.md`](./docs/rendering.md) for the details, including why
message rows are rendered without a React `key`.

---

## 8. Testing

Jest, run from this workspace: `cd client && npx jest <pattern>`.

Tests live in `__tests__` directories beside the code, and use
`test/layout-test-utils` for rendering. The project's philosophy is real logic
over mocks — which is the practical reason so many decisions in `utils/` are
extracted as pure functions: `getStableMessages`, `resolveComposerKeyDown`,
`splitMarkdown`, `shouldResetSubagentAtomsOnConversationChange` and the rest are
each the testable core of an otherwise stateful path.
