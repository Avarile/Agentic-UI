# Frontend (`/client`)

The web UI: a React 18 single-page application built with Vite, served from
`/client`, talking to the Express backend in `/api`.

This document explains **how the frontend works** and **how the project is
laid out**. It is the front door — for the layer-by-layer dependency model see
[`ARCHITECTURE.md`](./ARCHITECTURE.md), and for the three hardest subsystems see
[`docs/`](./docs).

Every source file also carries a header comment stating its purpose, why it is
shaped that way, and what it connects to. **Read a file's header before reading
the file** — it usually contains the reason the code is not simpler.

---

## Contents

1. [At a glance](#1-at-a-glance)
2. [Quick start](#2-quick-start)
3. [Project structure](#3-project-structure)
4. [How the app boots](#4-how-the-app-boots)
5. [Routing and the auth boundary](#5-routing-and-the-auth-boundary)
6. [The layer model](#6-the-layer-model)
7. [State](#7-state)
8. [Data access](#8-data-access)
9. [Sending a message](#9-sending-a-message)
10. [Receiving: streaming and resumability](#10-receiving-streaming-and-resumability)
11. [Rendering messages](#11-rendering-messages)
12. [Styling and theming](#12-styling-and-theming)
13. [Localization](#13-localization)
14. [Accessibility](#14-accessibility)
15. [Files and uploads](#15-files-and-uploads)
16. [Feature subsystems](#16-feature-subsystems)
17. [Build and tooling](#17-build-and-tooling)
18. [Testing](#18-testing)
19. [Conventions](#19-conventions)
20. [Where to add things](#20-where-to-add-things)

---

## 1. At a glance

|                  |                                                                 |
| ---------------- | --------------------------------------------------------------- |
| **Framework**    | React 18 (no SSR — a pure SPA)                                  |
| **Build**        | Vite 8 (Rolldown), `oxc` minifier                               |
| **Language**     | TypeScript 5.9 (`strict: true`, `noImplicitAny: false`)         |
| **Routing**      | react-router-dom 7, `createBrowserRouter`                       |
| **Server cache** | TanStack React Query v4                                         |
| **Client state** | Recoil 0.7 **and** Jotai 2.12 (a deliberate split — see §7)     |
| **Forms**        | react-hook-form 7                                               |
| **Styling**      | Tailwind CSS 3.4 with a shared preset + semantic token registry |
| **i18n**         | i18next / react-i18next — 41 locales, ~2,270 English keys       |
| **Tests**        | Jest 30 + Testing Library, jsdom                                |
| **Dev port**     | `3090` (backend on `3080`, proxied)                             |

Size: **1,242 non-test source files, ~164k lines**, plus 371 test files across 75 `__tests__` directories and co-located specs.

```
components  825 files   104k loc      hooks       210 files    33k loc
utils        66 files    12k loc      data-provider 46 files    7k loc
Providers    28 files     1.7k loc    store        27 files    2.4k loc
routes       11 files     1.6k loc    common/a11y/lib/@types  ~24 files
```

The bulk is `components/` and `hooks/`, and that ratio is intentional: see §6.

---

## 2. Quick start

The frontend needs the backend running, because the dev server proxies `/api`
and `/oauth` to it.

```bash
# from the repository root
npm run backend:dev      # Express on http://localhost:3080 (file watching)
npm run frontend:dev     # Vite dev server on http://localhost:3090 (HMR)
```

Other useful commands:

| Command                       | Run from  | Does                                                         |
| ----------------------------- | --------- | ------------------------------------------------------------ |
| `npm run frontend:dev`        | root      | Vite dev server with HMR                                     |
| `npm run build`               | root      | Build everything via Turborepo (parallel, cached)            |
| `npm run build:data-provider` | root      | Rebuild `packages/data-provider` after changing shared types |
| `npm run smart-reinstall`     | root      | Install deps if the lockfile changed, then build             |
| `npm run dev`                 | `client/` | Vite dev server directly                                     |
| `npm run build`               | `client/` | Production build into `client/dist`                          |
| `npm run typecheck`           | `client/` | `tsc --noEmit`                                               |
| `npx jest <pattern>`          | `client/` | Run tests matching a pattern                                 |
| `npm run test`                | `client/` | Jest in watch mode                                           |

**Environment.** Vite loads `.env` from the **repository root** (`envDir: '../'`),
not from `client/`. Only these prefixes are exposed to the bundle:

```
VITE_   SCRIPT_   DOMAIN_   ALLOW_   REACT_APP_THEME_
```

Anything without one of those prefixes stays server-side. Useful knobs:

| Variable             | Effect                                                      |
| -------------------- | ----------------------------------------------------------- |
| `PORT`               | Dev server port (default `3090`)                            |
| `HOST`               | Dev server host; IPv6 addresses are bracketed automatically |
| `BACKEND_PORT`       | Proxy target port (default `3080`)                          |
| `VITE_ALLOWED_HOSTS` | Comma-separated allowed hosts for the dev server            |
| `REACT_APP_THEME_*`  | Build-time theme colors (see §12)                           |

Node.js **v24.16.0**. MongoDB is required by the backend, not by the frontend.

---

## 3. Project structure

### Top level

```
client/
├── index.html            SPA shell; loads src/main.jsx. Also carries two
│                        inline pre-React scripts (see §4 and §17).
├── vite.config.ts        dev server, proxy, PWA, manual chunking (§17)
├── tailwind.config.cjs   consumes the shared preset from packages/client
├── postcss.config.cjs
├── tsconfig.json         path aliases: ~/* → ./src/*
├── jest.config.cjs       jsdom, coverage, worker memory limits
├── jest.resolver.cjs
├── babel.config.cjs      used by babel-jest only, not by the Vite build
├── nginx.conf            reference production config (TLS, SSE/WebSocket upgrade)
├── package.json
├── ARCHITECTURE.md       the layer model and dependency direction
├── docs/                 deep dives: state, streaming, rendering
├── public/               static assets copied verbatim (provider icons, favicons)
├── sw/heal.js            service-worker recovery script (§17)
├── test/                 Jest setup, mocks, render helpers
└── src/                  the application
```

### `src/`

```
src/
├── main.jsx              browser entry: awaits i18n, then renders
├── App.jsx               the provider stack — ordering is its entire content
├── style.css             Tailwind directives + CSS custom properties
├── mobile.css            mobile-only overrides
│
├── routes/          (11) URL → state resolution and the auth boundary
├── Providers/       (28) React contexts: the seams that share behaviour
├── store/           (27) atoms and selectors — values, not orchestration
├── data-provider/   (46) React Query hooks: keys, invalidation, polling
├── hooks/          (210) behaviour: everything that coordinates the above
├── components/     (825) rendering
├── utils/           (66) pure functions — React-free, unit-testable
├── common/           (9) client-only shared types
├── a11y/             (6) live regions for screen-reader announcements
├── lib/rum/          (6) real-user monitoring
├── locales/         (41) translation catalogues + i18next setup
├── constants/        (1) static data tables
├── polyfills/        (1) regeneratorRuntime
└── @types/           (2) ambient type augmentations
```

### Inside `components/`

Feature directories, largest first. Each is self-contained; cross-feature reuse
goes through `hooks/`, `Providers/` or `@librechat/client`.

```
Chat/            216  the conversation surface
  ├── Input/           the composer: text, commands, attachments, capability chips
  ├── Messages/        message rows, tree walking, and all content-part renderers
  └── Menus/           header menus: model selector, presets, bookmarks
SidePanel/       165  agent builder, MCP builder, parameters, memories, files
Nav/             103  account menu, search bar, settings dialog + all settings tabs
Prompts/          49  the prompt library
Skills/           39  markdown skill documents and their file trees
Messages/         30  chat-AGNOSTIC content primitives (see the note below)
SystemCore/       26  the 3D system-status scene (three.js / R3F)
Agents/           26  the agent marketplace
Files/            24  file dashboard and vector stores
Endpoints/        24  provider icons and settings panels
Input/            23  shared input primitives
Conversations/    18  the sidebar conversation list
Auth/             17  login, registration, 2FA, password reset
Artifacts/        15  the artifacts side panel
Sharing/          12  people picker, access roles, public links
Web/ Tools/ MCP/ Share/ Bookmarks/ UnifiedSidebar/ Projects/ MCPUIResource/
Plugins/ OAuth/ Audio/ System/ SharePoint/ Banners/ ui/
```

> **Two message directories, and the difference matters.**
> `components/Chat/Messages/` is chat-specific row and tree machinery.
> `components/Messages/` holds the chat-**agnostic** primitives — code blocks,
> mermaid, the markdown container, the standard content renderer — reused by the
> share route, search results and the artifacts panel, none of which have a live
> chat around them. That is why `Providers/CustomFormContext` exposes a
> non-throwing `useOptionalCustomFormContext`: the same components must render
> with no composer above them.

### Imports

`~/` aliases `src/`, configured in both `vite.config.ts` and `tsconfig.json`:

```ts
import { useLocalize } from '~/hooks';
import store from '~/store';
import { cn } from '~/utils';
```

Relative imports are for siblings inside a feature directory. Wire types come
from the `librechat-data-provider` package, never redefined locally.

---

## 4. How the app boots

```
index.html  (in document order)
  ├── inline script #1        reads localStorage `color-theme` and paints the
  │                           loading container's background BEFORE any JS
  │                           loads, so a dark-mode user never sees a white flash
  ├── inline script #2        installs the RUM pre-boot queue
  │                           (window.__lcRumQueue / __lcRumPush) and
  │                           window.__lcRecoverStaleAssets — diagnostics that
  │                           must survive a failure to load the bundle at all
  ├── src/lib/rum/bootstrap-entry.js
  │                           module script, NOT deferred, so it runs before the
  │                           app bundle and captures load-time errors even if
  │                           React never mounts.  Built into its own `rum` chunk.
  └── src/main.jsx            module script, deferred — the application entry
        ↓
src/main.jsx
  await initializeI18n()   render is BLOCKED on this. Painting first flashes raw
                           `com_*` keys. On failure it renders anyway — English
                           fallbacks beat a blank page.
  ApiErrorBoundaryProvider the 401 sink, provided ABOVE App because App creates
                           the QueryClient that reports into it
        ↓
src/App.jsx  — the provider stack, outside-in:
  QueryClientProvider      server cache
    RecoilRoot             client state
      LanguageSync         applies the stored language to i18next
      LiveAnnouncer        aria-live regions
        ThemeProvider      paints the CSS variables everything else styles against
          RadixToast → ToastProvider → DndProvider
            RouterProvider → src/routes/index.tsx
            WakeLockManager, QueryDevtoolsGate, Toast
```

Each layer sits above the ones that depend on it. Three details are load-bearing:

- **`networkMode: 'always'`** on the QueryClient. LibreChat is routinely
  self-hosted, and `navigator.onLine` reports `false` on a machine with no WiFi
  whose `localhost` backend is perfectly reachable — the default mode would pause
  every query.
- **The theme is spread in conditionally.** `initialTheme`/`themeRGB` are passed
  only when a build-time env theme exists, so on a default deployment the user's
  stored preference stays authoritative instead of being overwritten each boot.
- **A hidden silent-audio iframe** is mounted at the root. Browsers refuse
  programmatic TTS playback until the document has had an autoplay-permitted
  audio element; this is the standard workaround.

---

## 5. Routing and the auth boundary

`src/routes/index.tsx` expresses authentication as **structure**, not as
conditionals. Three sibling trees, in decreasing publicness:

```
share/:shareId          public — NO AuthContextProvider above them at all
oauth/success|error     public — the OAuth callback must work pre-session
verify                  public — email verification from a mailed link

/  → StartupLayout      pre-auth forms: register, forgot-password, reset-password

   → AuthLayout         the ONLY subtree with a session
      │  AuthContextProvider + WithRum + ApiErrorWatcher
      ├── LoginLayout           login, login/2fa
      ├── dashboardRoutes       legacy /d/* → redirects
      └── Root                  the authenticated app shell
            ├── /                  → redirect to /c/new
            ├── /c/:conversationId? ChatRoute
            ├── /search             Search
            ├── /prompts/:promptId  lazy
            ├── /skills/*           lazy
            ├── /projects/*         lazy
            └── /agents/:category?  marketplace
```

`AuthContextProvider` lives on a **route element**, not in `App.jsx`. That is
what makes the public routes genuinely public: they never mount the session
machinery and never provoke a token refresh. Anything rendered from the share
route must therefore tolerate the absence of auth and chat-form context.

Heavy views use React Router's `lazy:` so large dependency trees stay out of the
initial chunk. `basename` is read from the document's `<base href>`, so one build
can be served from a sub-path without rebuilding.

**Three route files do most of the work:**

| File                   | Role                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `routes/Root.tsx`      | the authenticated shell. Hosts the app-wide singletons exactly once: the file/assistants/agents maps (built here, pushed down as context so the whole tree shares one mapping pass), the banner, the sidebar, keyboard shortcuts, the System Core dialog. Height is `100dvh - bannerHeight`, measured live, so an announcement cannot push the composer off-screen. |
| `routes/ChatRoute.tsx` | resolves a URL into conversation state. The most timing-sensitive file in the client — see below.                                                                                                                                                                                                                                                                   |
| `routes/Search.tsx`    | the virtualized message-search results page.                                                                                                                                                                                                                                                                                                                        |

### Why `ChatRoute` is careful

`/c/:conversationId` must reconcile **startup config, endpoints, models, the
conversation itself, roles, the agent catalogue** and an optional `?projectId`
scope before it may call `newConversation()` even once. That call writes
conversation state, and an atom effect then persists those choices to
localStorage — so calling it early does not merely render wrong once, it poisons
the stored defaults for the next session. A `hasSetConversation` ref (from
`SetConvoProvider`, so it survives remounts) makes it fire once.

The recurring principle in its gates: **distinguish "not yet known" from "known
to be absent."** A 404 means the conversation or project is genuinely gone and
the fallback should run; a 500 or a network blip must not unscope a valid project
or invalidate a stored agent pick. Queries there run with `retry: false`, so
`isNotFoundError` is checked explicitly rather than treating any error as absence.

---

## 6. The layer model

Nine directories, in dependency order. Each layer may import from the layers
above it in this table, and should not import downward.

| Layer          | Directory                   | Owns                                                                              |
| -------------- | --------------------------- | --------------------------------------------------------------------------------- |
| Pure functions | `utils/`                    | Tree building, cache reconciliation, parsing, sanitizing, formatting. React-free. |
| Types          | `common/`, `@types/`        | Client-only types. Wire types come from `librechat-data-provider`.                |
| State          | `store/`                    | Atoms and selectors. Values, not orchestration.                                   |
| Data access    | `data-provider/`            | React Query hooks: keys, staleness, invalidation, optimistic updates.             |
| Behaviour      | `hooks/`                    | Everything that coordinates state, queries and effects.                           |
| Contexts       | `Providers/`                | The seams that share behaviour down a subtree.                                    |
| Components     | `components/`               | Rendering.                                                                        |
| Routes         | `routes/`                   | URL → state resolution and the auth boundary.                                     |
| Cross-cutting  | `a11y/`, `lib/`, `locales/` | Live regions, RUM, i18n.                                                          |

### The rule that shapes everything

**Atoms are dumb; hooks orchestrate.** `store/` holds values and derived
selectors and nothing else. Every non-trivial interaction between two atoms, or
between an atom and a query, is a hook in `hooks/`.

That is why `hooks/` has 210 files and `store/` has 27, and it is what keeps the
state layer readable. If you want a selector that fetches, writes, or sequences —
that is a hook.

`hooks/` is organized by **domain**, not by hook kind. A hook belongs in the
folder named after the thing it manipulates:

```
hooks/Chat/       sending, aborting, steering, draining the queue
hooks/SSE/        receiving: the event stream and its folders
hooks/Messages/   rendering concerns: scrolling, metadata, expansion, copy
hooks/Input/      the composer
hooks/Files/      uploads
hooks/Agents/     hooks/Assistants/  hooks/MCP/  hooks/Skills/  hooks/Prompts/
hooks/Conversations/  presets, navigation, export, tags
hooks/Audio/      TTS engines, playback, the microphone gate
hooks/Roles/      hooks/Sharing/     permission checks
hooks/Config/     one-time startup effects
hooks/Generic/    small hooks with no domain attachment
```

`Providers/` types each context as `ReturnType<typeof theHook>` so a context can
never drift from the hook that fills it.

---

## 7. State

The client runs **two state libraries side by side**. This is a deliberate
split, not drift.

|           | Recoil                                                                                                                       | Jotai                                               |
| --------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Holds     | The conversation model                                                                                                       | Preferences; high-frequency per-conversation values |
| Shape     | Atom _families_ keyed by pane index or conversation id, plus derived selectors                                               | Small independent atoms and atom families           |
| Why       | `atomFamily`/`selectorFamily` and `useRecoilCallback` (read **without** subscribing) are what the chat machinery is built on | A write should re-render exactly one subscriber     |
| Import as | `store.isSubmittingFamily(index)`                                                                                            | `import { fontSizeAtom } from '~/store/fontSize'`   |

Recoil modules default-export an object of atoms, spread into the single `store`
namespace. Jotai modules use named exports. A name is exported once, from one
library — reaching for `store.x` and finding nothing usually means `x` is a Jotai
atom needing a named import.

### Keying conventions

```
*ByIndex, *Family    keyed by PANE index.  0 = primary chat, 1..n = the extra
                     panes of a multi-response ("add a model") run.
                     Describes a slot on screen.

*ByConvoId           keyed by CONVERSATION id.  State that must survive that
                     slot being reused for a different conversation.
```

`isSubmittingFamily` is per-pane because it describes what a slot is doing.
`pendingSteersByConvoId` and `queuedMessagesByConvoId` are per-conversation
because a user can navigate away mid-run and their queued follow-ups must still
be there on return. `Constants.NEW_CONVO` acts as a template key: the user
configures the new-chat composer before an id exists, and that state is copied
across once the server assigns one.

### Patterns you will meet immediately

- **Narrow selectors over wide reads.** `conversationIdByIndex`,
  `conversationModelByIndex`, `conversationSpecByIndex` … exist so a consumer
  needing one field does not re-render when an unrelated field changes.
- **Persistence as an atom effect.** `conversationByIndex`'s `onSet` is where the
  last agent, spec, tools and endpoint settings reach localStorage. Keeping it in
  the effect means every writer persists identically and no call site can forget.
- **Queues, not slots, for terminal signals.** `runEndsByIndex` holds an _array_
  even though consumers want one at a time. A pane can receive conversation A's
  final frame after the user has navigated to B and started a run there; a single
  replaceable slot silently loses A.
- **"Already handled" is recorded, not inferred.** A steer's 202 ACK and its
  `on_steer_applied` SSE event travel on different connections and arrive in
  either order, so `appliedSteerIdsByConvoId` exists.
- **Identity guards on async settlement.** Anything resolving after an `await`
  and then writing state is fenced on `(conversationId, generationCreatedAt)`.
  `hooks/Chat/abort.ts` is the minimal canonical example.

### Persistence helpers

| Helper                        | Library | Cross-tab | For                                                     |
| ----------------------------- | ------- | --------- | ------------------------------------------------------- |
| `atomWithLocalStorage`        | Recoil  | yes       | any persisted Recoil atom                               |
| `createStorageAtom`           | Jotai   | yes       | user _preferences_ — a font size should follow the user |
| `createTabIsolatedAtom`       | Jotai   | **no**    | per-tab working state                                   |
| `createStorageAtomWithEffect` | Jotai   | yes       | values that must also reach the DOM                     |

Tab isolation omits `subscribe` from the SyncStorage adapter. It exists for a
concrete reason: every new chat shares the same `LAST_MCP_new` key, so ordinary
cross-tab sync would make one tab's MCP picks appear in another tab's new chat.

`atomWithLocalStorage` guarantees that a corrupt stored value falls back to the
default **and rewrites storage** (so a bad value cannot fail on every boot), and
its optional normalizer is where migrations live. Per-conversation keys are
timestamped (`utils/timestamps.ts`) and swept at startup, since conversations are
unbounded and localStorage otherwise grows for the life of the profile.

→ Full detail: [`docs/state.md`](./docs/state.md)

---

## 8. Data access

```
librechat-data-provider   endpoint URLs, wire types, dataService   (packages/)
        ↓
src/data-provider/        React Query hooks: keys, staleness, invalidation
        ↓
hooks/  →  Providers/  →  components/
```

`src/data-provider/` is **not** the same thing as the `librechat-data-provider`
package. The package owns the wire contract. This directory owns what the package
cannot know: cache keys and staleness, invalidation after a mutation, polling and
backoff, optimistic updates, and query gating on auth or permission.

**Layout convention.** New features get a directory:

```
data-provider/Feature/queries.ts
data-provider/Feature/mutations.ts
data-provider/Feature/index.ts     → re-exported from data-provider/index.ts
```

The flat files at the top level — `queries.ts`, `mutations.ts`, `prompts.ts`,
`roles.ts`, `tags.ts`, `Favorites.ts` — predate that rule and still hold
conversations, presets, assistants, actions and speech. **Add to a directory, not
to the flat files.**

Most mutations here are not thin `useMutation` wrappers; the bulk of each is
**cache reconciliation**. A rename has to patch every paginated conversation list
containing that conversation; an archive removes it from some lists and adds it
to others — without refetching. `utils/convos.ts` provides the shared
implementations (`upsertConvoInAllQueries`, `updateConvoInAllQueries`,
`removeConvoFromAllQueries`) so no call site needs to know the page shape.

Frontend query and mutation keys live in
`packages/data-provider/src/keys.ts`; endpoints in `api-endpoints.ts`; the
service in `data-service.ts`.

---

## 9. Sending a message

```
ChatForm                       composer input
  └── useSubmitMessage         validation, draft handling
        └── useChatFunctions.ask
              • pick the parent message id (branch-aware)
              • mint the optimistic user message + placeholder response
              • resolve the endpoint option, including any ephemeral agent
              • drain the pending queues: manual skills, quotes
              └── store.submissionByIndex          ← THE HANDOFF
                    └── useAdaptiveSSE             opens the stream
                          └── useEventHandlers     folds events into state
                                └── components render
```

The submission atom is the seam between send and receive. `hooks/Chat/` writes
it; `hooks/SSE/` reads it and writes messages back. Clearing it tears the stream
down.

Two things worth knowing:

**Optimistic messages are deliberately unhydrated.** `ask` mints them with
`v4()` ids and no timestamps. That shape is a _signal_, not an oversight —
`data-provider/Messages/queries.ts` detects it to decide when not to trust a
server response (§10). Note also that a streaming message's id changes three
times: client UUID → created-handler id → server id. Nothing downstream may
assume it is stable.

**`STALE_SEND_REVALIDATION_MS` guards sending mid-revalidation.** A message cache
written within the last few seconds is locally authoritative — the run that just
streamed wrote it — and is safe to send from. An older one waits for the refetch,
because otherwise the new message forks from an outdated tail and silently
creates a branch.

### The composer

`components/Chat/Input/ChatForm.tsx` is the densest component in the app, because
one text field serves every state a conversation can be in:

- **idle** → send
- **mid-run** → steer, queue, or interrupt (per the `duringRunDefaultAction` and
  interrupt preferences)
- **model asked a question** → answer that instead

It also hosts four command popovers (`@` mentions, `+`, `/` prompts, `$` skills),
attachments, dictation, token usage, and chips for everything pending. The send
control is not one button but several that swap by state, so each one's label
stays honest.

`utils/shortcuts.ts`'s `resolveComposerKeyDown` is the single decision point for
what **Enter** means — pure, and therefore testable, which matters because it is
the most user-visible branch in the client.

---

## 10. Receiving: streaming and resumability

**The capability that costs everything: a generation is owned by the server, not
by the tab that started it.** It survives a reload, a network drop, a tab switch,
a second tab. The client _attaches_ to a run and can re-attach later.

```
hooks/SSE/useAdaptiveSSE        picks the implementation
  ├── useResumableSSE           the default (~3,950 lines)
  └── useSSE                    fallback for assistants endpoints (no resumption)
        ↓
hooks/SSE/useEventHandlers      one handler per event type, shared by BOTH
  ├── useContentHandler         text and reasoning deltas — the hot path
  ├── useStepHandler            tool calls, arguments, outputs, nested subagents
  ├── useAttachmentHandler      files the model produced
  └── useUsageHandler           token usage
```

`useAdaptiveSSE` always calls **both** implementations (Rules of Hooks) and
passes `null` to the inactive one — so every hook below must treat a null
submission as "do nothing".

Consequences of resumability, in rough order of how much code they account for:

- **Starting is a negotiation, not a request.** Separate retry budgets exist for
  separate failure modes — `SERVER_NOT_READY` (wait, with a 120s ceiling), an
  ambiguous transport failure (`START_GENERATION_NETWORK_RETRIES`), and
  `GENERATION_PREDECESSOR_MISMATCH` (reconcile). A retry that is actually a
  _duplicate start_ is much worse than a slow one.
- **Reconnection means reconciliation, not replacement.** On re-attach the server
  sends its view of the run — content so far, pending steers, applied steer ids —
  and local optimistic state may be ahead of or behind it.
- **Terminal events can arrive for a conversation the user has left.** Hence the
  identity fences and run-end queues from §7.
- **Protocol version gates behaviour.** `data-provider/SSE/protocol.ts`
  negotiates fail-closed: only an exact numeric echo of `2` enables v2. An old
  server, a stripped field, the string `"2"`, or a future version all stay on the
  legacy path. The version is carried **per generation**, not per session.

### Resuming on load

`hooks/SSE/useResumeOnLoad.ts` asks whether the conversation has a live stream
and, if so, rebuilds enough state for the normal path to take over. It must not
run against a half-loaded cache, which is why `ChatView` gates it on
`!isLoading && !isFetching`: navigation now _invalidates_ rather than removes the
message cache, so a warm conversation mounts with `isLoading: false` while its
refetch is still in flight.

### Defending the message cache

The server's persisted list can legitimately lag what the client displays.
Mid-stream the assistant's reply exists in the cache as an unhydrated tail but
may not be persisted — so a refetch can return **fewer messages** than are on
screen, or a **404** for a conversation that is actively generating. Trusting the
response there wipes the reply out from under the user.

Two narrow predicates in `data-provider/Messages/queries.ts` encode when not to:
`getStableMessages` (keep the cache when the response is a strict _prefix_, a
stream is live, and the cache ends in a pending assistant tail) and
`shouldPreserveMessagesOnNotFound` (the same reasoning for a 404). `hasActiveJob`
consults the active-jobs cache so the guard also holds after a reload, when
nothing is streaming _in this tab_ but the run continues.

### Steering, queueing, aborting

**Steering** injects a message into a running generation. A steer has more states
than a message does (`sending`, `pending`, `applied`, `failed`,
`deliveryUncertain`) and every one is reconciled against the server. Leftover
steers at run end are _converted_ into queued follow-ups rather than dropped.

**The follow-up queue** auto-sends one message per completed run, driven by the
one-shot `runEndByIndex` signal — each drained message starts a normal turn whose
own terminal event drains the next. Aborts and errors do not drain unless
"interrupt & send" explicitly armed it. Queued attachments are re-touched every
30 minutes so the server does not sweep them while the message waits.

**Aborting** is not one operation: the HTTP abort call, the stream's terminal
event, and the queue-drain signal all resolve independently and in any order.

→ Full detail: [`docs/streaming.md`](./docs/streaming.md)

---

## 11. Rendering messages

Messages are stored **flat** with `parentMessageId` pointers. Branching —
regenerate, edit-and-resubmit, fork — makes a conversation a **tree**.

```
utils/buildTree.ts     flat list + file map → tree.  Hydrates file references in
                       the SAME pass, so attachments need no per-file lookup.
      ↓
MultiMessage           recursive walk; picks which sibling to show at each branch
      ↓
one of three renderers by message shape:
   MessageParts        assistants endpoint + content[]
   MessageContent      content[] (standard endpoints)  ← in components/Messages/
   Message             legacy text-only
```

### Three decisions in `MultiMessage` to understand before editing it

1. **Rows render without a React `key`.** A streaming message's id changes three
   times, so neither is stable. _With_ a key, React unmounts and remounts the
   entire subtree on each SSE event — destroying memoized state and flickering
   visibly. Without one it reuses the instance and updates props in place.
2. **Sibling selection reconciles by identity, not by reset.** Selection is
   positional (a reversed index), so a change to a level's children would
   silently change what is displayed. An _appended_ newest child means a
   submission landed here (send/regenerate/edit-resubmit all append) → follow it.
   A newest id that changed while the previous one _vanished_ is the same row
   being re-keyed mid-stream → do not move.
3. **The child recursion is a sibling of the row, not nested inside it.** Nested,
   a row that bailed out via its memo comparator would sever the walk delivering
   streaming updates to its descendants.

### The four performance mechanisms

| Mechanism                | Where                                                      | Why                                                                                                                                                                               |
| ------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Block-level memoization  | `MarkdownBlocks.tsx`                                       | Only the last block changes per token. Splitting makes a long answer cost the same per token as a short one instead of re-parsing the whole document.                             |
| Field-level comparators  | `areMessageRowPropsEqual`                                  | The message object is a fresh reference on every write, so shallow equality never bails.                                                                                          |
| Narrow subscriptions     | `MessagesViewContext`, `useLatestMessage`, `EditorContext` | Re-export only the needed fields, in separately memoized clusters. `useLatestMessage` is split into three hooks so a consumer needing only an id does not subscribe to a message. |
| Isolated re-render hosts | `ScrollButton`, `SidebarChatProvider`                      | Components existing purely to confine a subscription. Recoil subscriptions do not propagate to parents, which is what makes this work.                                            |

### Scrolling

Auto-follow the bottom while streaming; yield the moment the user scrolls. The
thresholds are **asymmetric on purpose**: leaving is detected tightly (24px) so a
deliberate scroll hands over control immediately, while returning is detected
loosely (150px) because while an answer streams the bottom is a _moving target_ —
it recedes between the reader's last wheel tick and the frame that measures
position. Symmetric thresholds mean the reader can never quite catch it.

Content that changes size after layout (an expanded tool output, a late image)
announces itself through a custom DOM event rather than state, since publisher
and subscriber are arbitrarily far apart and the signal must not itself cause a
render.

→ Full detail: [`docs/rendering.md`](./docs/rendering.md)

---

## 12. Styling and theming

Tailwind CSS 3.4, consuming a **shared preset** from `packages/client` plus a
canonical semantic token registry:

```js
// tailwind.config.cjs
presets: [require('../packages/client/tailwind.preset.cjs')],
colors: createTailwindColors(),   // from the versioned token registry
darkMode: ['class'],
content: ['./src/**/*.{js,jsx,ts,tsx}', '../packages/client/src/**/*.{js,jsx,ts,tsx}'],
```

The rules (from `CLAUDE.md`, and enforced in review):

- **Compose before styling.** Look for an existing `@librechat/client` primitive,
  semantic variant, or composition before adding feature-local classes or CSS.
- **Use semantic roles.** Colors and shared appearance values come from semantic
  Tailwind/theme roles — `bg-surface-primary`, `text-text-secondary`,
  `border-border-light`. No raw palette utilities, no hard-coded hex/RGB/HSL, no
  light/dark-specific values in feature components.
- **Deepen the system when the need is reusable.** Add a focused variant to a
  shared primitive, or extend the token registry, rather than creating a shallow
  local wrapper that merely relocates class strings.
- **Themes are data, not arbitrary CSS.** A theme definition selects semantic
  colors and appearance roles. It must not contain selectors, behaviour, or
  alternate layouts.
- **Keep layout and behaviour local.** Feature structure, responsive layout,
  state-driven transitions and specialized visualization stay feature-owned.
- **Custom CSS is an exception.** Narrowly scoped, consuming theme variables,
  supporting light/dark and reduced motion, with a brief note on why.

`utils/cn.ts` (clsx + tailwind-merge) is how classes are composed — later
conflicting utilities win, which matters for variant overrides. The class-string
constants in `utils/index.ts` (`cardStyle`, `defaultTextProps`) are **legacy**; a
long tail of components still imports them, but new work should not.

Build-time theming: `REACT_APP_THEME_*` variables map onto the token registry via
`utils/getThemeFromEnv.js`, which returns `undefined` when nothing is set — that
is what lets a user's stored preference stand on an unthemed deployment.

`src/style.css` holds the Tailwind directives and CSS custom properties;
`src/mobile.css` holds mobile-only overrides.

---

## 13. Localization

- **All user-facing text goes through `useLocalize()`.** No exceptions — an
  eslint rule (`i18next/no-literal-string`) enforces it.
- `useLocalize` exports `TranslationKeys`, the union of every key in the English
  catalogue, so a typo is a **compile error** rather than a raw key in the UI.
  Components that accept a label key take that type.
- **Only `src/locales/en/translation.json` is hand-edited.** The other 40 locales
  are synchronized externally — do not edit them.
- Keys use semantic prefixes: `com_ui_`, `com_auth_`, `com_nav_`,
  `com_assistants_`, `com_agents_`, …
- Catalogues are **lazily loaded per locale**, one chunk each (see §17), and
  `main.jsx` awaits `initializeI18n()` before first render so no raw key is ever
  painted.
- `components/System/LanguageSync.tsx` applies the stored preference and guards
  the race where two catalogue loads are in flight — only the latest may clear
  `languageLoading`.
- Admin-configured strings that ship per-language variants go through
  `useLocalizedConfig`, since their keys do not exist at build time.

---

## 14. Accessibility

- **`src/a11y/`** provides the announcement channel: `announcePolite` and
  `announceAssertive`, backed by two separate `aria-live` regions. Two rather
  than one, because polite waits for the reader to finish and assertive
  interrupts — a single region cannot express both. Re-announcing identical text
  requires a clear between the two, or the second announcement is dropped.
- **Semantic HTML with ARIA labels.** `role`, `aria-label`, `aria-hidden`. The
  chat page carries an `sr-only` `<h1>` naming the conversation — guarded, because
  Recoil's conversation can lag the route mid-navigation and announcing the
  previous title is worse than announcing nothing.
- **Focus is managed, not left to chance.** `useFocusTrap` for surfaces that are
  modal without being Radix dialogs; `utils/focus.ts` for the request/consume
  pair that returns focus to the composer; explicit opener refs so dismissing a
  panel restores focus to whatever raised it.
- **`inert`, not just hidden.** The mobile sidebar marks the content pane behind
  it `inert`, removing it from the tab order rather than merely covering it.
- **Reduced motion is honoured** throughout — scroll glides become jumps, the
  streaming fade is disabled, artifact transitions are dropped.
- **Keyboard shortcuts are remappable** (`useKeyboardShortcuts` +
  `store.customShortcuts`), with a recorder that rejects combinations shadowing
  browser or accessibility shortcuts.

---

## 15. Files and uploads

An upload happens **before** the message that uses it, which is where the
complexity comes from.

```
drop / paste / picker / SharePoint
        ↓
useFileUploadRouter        routes to conversation attachment, agent file, or
                          tool resource, by endpoint and capability
        ↓
useFileHandling            ONE funnel: validate → resize → upload → track → attach
        ↓
useMarkFilesUsageMutation  at send time — how the server learns which uploads to keep
```

- Limits are merged **per endpoint** (`getEndpointFileConfig`), because size and
  type limits differ by provider and by tool resource. `utils/files.ts` is the
  single source for "is this file acceptable".
- Images are downscaled in the browser first (`useClientResize`), and the
  resulting preview is cached (`utils/previewCache.ts`) so the attachment renders
  immediately instead of waiting for the server's own preview.
- HEIC/HEIF is converted (`utils/heicConverter.ts`) — necessary, not nice: iOS
  photos default to HEIC and no browser renders them.
- Server previews are generated asynchronously, so `useFilePreview` polls with
  backoff and a hard error ceiling — without it a permanently unrenderable file
  would poll for the whole session.
- **Orphan cleanup**: files attached and never sent are recorded in
  localStorage (`useSetFilesToDelete`) and swept on next boot by
  `components/Chat/Presentation.tsx` — the only place that garbage collection
  happens, which matters when a tab is closed mid-compose.
- SharePoint is a separate path (`hooks/Files/useSharePoint*`) because files come
  from Microsoft Graph with a short-lived token and are re-uploaded, with
  per-file _and_ aggregate progress so a partial batch failure is attributable.

---

## 16. Feature subsystems

| Subsystem         | Where                                                                 | Notes                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Agents**        | `components/Agents/`, `components/SidePanel/Agents/`, `hooks/Agents/` | A marketplace plus a multi-panel builder. `AgentPanelContext` fetches the expensive shared data once (tool catalogue, MCP servers, connection status, actions) so panels cannot disagree about what is available. Three shapes of "an agent" exist on purpose: the permission-filtered catalogue, one agent's record, and an expanded record for the builder.            |
| **Skills**        | `components/Skills/`, `hooks/Skills/`, `data-provider/Skills/`        | Markdown documents with attached file trees that agents can invoke. Organized by role — `layouts/`, `lists/`, `display/`, `forms/`, `tree/`, `dialogs/`, `utils/`. Metadata, file list and file content are separate queries so browsing never fetches bodies. Invoked manually from the composer's `$` popover, which queues chips the user can dismiss before sending. |
| **Projects**      | `components/Projects/`, `data-provider/Projects/`                     | A grouping of conversations with its own workspace. A chat is scoped via `?projectId`, which `ChatRoute` _verifies_ before trusting.                                                                                                                                                                                                                                     |
| **MCP**           | `components/MCP/`, `hooks/MCP/`, `store/mcp.ts`                       | The one integration where the client manages a **connection**, not just calls an endpoint: servers initialize, may need OAuth, may defer connection to request time, and may never enumerate tools. Init state is global, so an OAuth flow started in the chat dropdown is cancellable from settings.                                                                    |
| **Artifacts**     | `components/Artifacts/`, `hooks/Artifacts/`, `store/artifacts.ts`     | Runnable/previewable output in a side panel. The panel opens on _focus_, not existence, so revisiting an old conversation full of artifacts leaves it closed. Sandpack and Monaco are lazily loaded. Edits are saved back into the producing message — so editing an artifact is a _message_ mutation.                                                                   |
| **Steering**      | `hooks/Chat/useSteering.ts`, `components/Chat/Input/*Steer*`          | Mid-run message injection. See §10.                                                                                                                                                                                                                                                                                                                                      |
| **Subagents**     | `store/subagents.ts`, `utils/subagentContent.ts`                      | Progress is folded incrementally into a bounded aggregate; the raw event log is never retained, so thousands of deltas cost what the rendered output costs.                                                                                                                                                                                                              |
| **Audio**         | `hooks/Audio/`, `hooks/Input/useSpeechToText.ts`, `components/Audio/` | Interchangeable browser and server engines behind one interface. `useAudioOutput` is a _registry_ of audible sources, which is what lets `useMicGate` keep STT and TTS half-duplex — otherwise dictation records the assistant's own voice.                                                                                                                              |
| **System Core**   | `components/SystemCore/`                                              | A 3D system-status scene (three.js / React Three Fiber). Fully behind a lazy boundary render-gated on `open`, so the `three` chunk is never fetched and no WebGL context exists until the modal is opened. Module state lives in the dialog, not the scene, so edits survive a close.                                                                                    |
| **Sharing**       | `components/Sharing/`, `hooks/Sharing/`                               | One dialog serving agents, prompts, skills and projects, driven by the `utils/resources.ts` config table.                                                                                                                                                                                                                                                                |
| **Share view**    | `components/Share/`, `routes/ShareRoute.tsx`                          | Read-only public transcripts. No session, which is the constraint that shapes `components/Messages/`.                                                                                                                                                                                                                                                                    |
| **Search**        | `routes/Search.tsx`, `components/Chat/Messages/SearchMessage.tsx`     | Virtualized full-content results. Every way a row's height can change after measurement has an explicit cache invalidation.                                                                                                                                                                                                                                              |
| **Memory**        | `components/SidePanel/Memories/`, `data-provider/Memories/`           | What the assistant has remembered, plus preferences — opting out never implies deleting.                                                                                                                                                                                                                                                                                 |
| **Observability** | `lib/rum/`, `data-provider/Langfuse/`                                 | RUM scoped to authenticated navigation, with URLs normalized to route patterns so `/c/<uuid>` does not produce one route per conversation.                                                                                                                                                                                                                               |

---

## 17. Build and tooling

### Dev server

```
port 3090 (PORT)     →  proxies /api and /oauth to http://localhost:3080 (BACKEND_PORT)
envDir '../'         →  .env is read from the repository root
envPrefix            →  VITE_ SCRIPT_ DOMAIN_ ALLOW_ REACT_APP_THEME_
```

### Production build

`npm run build` (in `client/`) → `client/dist`, with
`NODE_OPTIONS=--max-old-space-size=8192` because the graph is large. Minifier is
`oxc`; source maps only in development.

**Manual chunking** is extensive (`build.rolldownOptions.output.codeSplitting`),
and two of the groups exist for correctness rather than size:

> `mermaid` and **all** its dependencies (chevrotain, langium, dagre-d3-es,
> nested lodash-es) share one chunk; `three` and `@react-three/*` share another.
> Splitting a library from the runtime that registers against it invites module
> initialization-order bugs.

Other notable groups: `rum`, `sandpack`, `code-editor` (Monaco), `codemirror-*`,
`markdown-processing`, `markdown_highlight`, `math-katex`, `virtualization`,
`radix-ui`, `framer-motion`, `i18n`, `avatars`, `query-devtools`, `polyfills`,
and one `locale-<lang>` chunk per non-English locale. Everything else falls into
`vendor`. Assets are content-hashed; fonts go to `assets/fonts/`.

### PWA and stale-asset recovery

This is worth understanding before touching `index.html` or `vite.config.ts`.

- `vite-plugin-pwa` with `registerType: 'autoUpdate'` and `useCredentials: true`.
- **`navigateFallback: null`** — LibreChat mutates `index.html` per request for
  subpath and language support, so it must never be served from the precache.
- **`sw/heal.js`** is emitted as `sw-heal.js` and injected via `importScripts`. It
  reloads window clients that cannot answer a ping after activation: a page stuck
  on a previous build's purged precache has no working code of its own to recover
  with.
- Locale chunks use `StaleWhileRevalidate` (80 entries, 30 days).
- **`window.__lcRecoverStaleAssets`** is defined by an inline script in
  `index.html`, and `main.jsx` registers a `vite:preloadError` listener that calls
  it. After a release the old `index.html` asks for hashed chunks that no longer
  exist; this reloads instead of surfacing a chunk-load crash. The recovery is
  rate-limited via `sessionStorage` so it cannot loop.

### The two inline scripts in `index.html`

1. **Theme pre-paint.** Reads `localStorage['color-theme']` and sets the loading
   container's background before any JS loads, so a dark-mode user never sees a
   white flash.
2. **RUM pre-boot queue.** `window.__lcRumQueue` / `__lcRumPush` buffer
   diagnostics (capped at 20, persisted to `sessionStorage`) so errors during
   initial load are captured _even if React never mounts_. Attribute values are
   filtered to primitives — "diagnostics should never affect application startup".

### Reference deployment

`nginx.conf` is a Mozilla-intermediate TLS reference config that also maps the
`Upgrade` header, so the admin-panel proxy can pass SSE and WebSocket
connections. Compression is applied at build time (`vite-plugin-compression2`,
10KB threshold).

---

## 18. Testing

Jest 30 + Testing Library, jsdom, run **from this workspace**:

```bash
cd client
npx jest <pattern>       # one-shot
npm run test             # watch mode
npm run test:ci          # CI: --ci --logHeapUsage
```

Layout:

```
src/**/__tests__/*.spec.tsx     tests beside the code they cover
test/layout-test-utils.tsx      the render helper — use this, not bare render()
test/setupTests.js              global setup
test/*.mock                     localStorage, matchMedia, resizeObserver
```

Config notes worth knowing: `~/` and `test/` are mapped in `moduleNameMapper`;
CSS becomes `identity-obj-proxy` and media files `jest-file-loader`;
`transformIgnorePatterns` carries a long allowlist because the markdown/unified
ecosystem ships ESM. `workerIdleMemoryLimit: '800MB'` recycles bloated workers —
coverage maps accumulate for the life of a worker, and a long run can otherwise
get one killed by the OS, failing whatever suite it held.

### Philosophy

**Real logic over mocks.** Exercise actual code paths with real dependencies;
mocking is a last resort. Prefer **spies** — assert a real function was called
with the expected arguments without replacing its logic. Only mock what you
cannot control: external HTTP APIs, rate-limited services, non-deterministic
system calls. Heavy mocking is a code smell, not a strategy.

This is the practical reason so many decisions live in `utils/` as pure
functions: `getStableMessages`, `resolveComposerKeyDown`, `splitMarkdown`,
`shouldResetSubagentAtomsOnConversationChange` and the rest are each the testable
core of an otherwise stateful path. Cover loading, success **and** error states
for UI and data flows.

---

## 19. Conventions

### Naming and files

- **Single-word file names** wherever possible (`permissions.ts`, `service.ts`).
- When several words are needed, prefer grouping under a **single-word
  directory** rather than a multi-word filename — `admin/capabilities.ts`, not
  `adminCapabilities.ts`. The directory already provides the context.
- `index.ts` barrels for clean exports. Note that `components/index.ts`
  deliberately re-exports only `./ui`: a root barrel over 825 files would defeat
  code splitting.

### Structure

- **Never-nesting**: early returns, flat code, minimal indentation. Break complex
  operations into well-named helpers.
- **Functional first**: pure functions, immutable data, `map`/`filter`/`reduce`.
  Reach for OOP only when it clearly improves domain modelling.
- **No dynamic imports** unless genuinely necessary (route-level `lazy:` and the
  deliberate lazy boundaries in §17 are the exceptions).

### Types

- **Never `any`.** Explicit types for parameters, returns and variables.
- **Limit `unknown`** — avoid `Record<string, unknown>` and `as unknown as T`.
  A `Record<string, unknown>` almost always signals a missing type definition.
- **Don't duplicate types.** Check `packages/data-provider` before defining
  anything; extend rather than restate.
- Always standalone `import type { … }`, never inline `type` in a value import.
- All TypeScript and ESLint diagnostics must be resolved.

### Iteration and performance

- **Minimize looping**, especially over message arrays, which are iterated
  constantly. Consolidate sequential O(n) passes into one; never iterate the same
  collection twice if the work can be combined.
- Choose data structures that avoid iteration — `Map`/`Set` over
  `Array.find`/`Array.includes`. This is why `utils/map.ts` exists.
- Watch closures, dispose listeners and resources, avoid circular references.

### Import order

Three sections:

1. **Package imports** — shortest to longest line (`react` always first).
2. **`import type`** — longest to shortest; package types first, then local, with
   length resetting between sub-groups.
3. **Local/project imports** — longest to shortest.

Multi-line imports count total characters across all lines.

### Comments

Self-documenting code; JSDoc for genuinely non-obvious logic or public-API
intellisense. The **file-header** blocks added throughout this codebase are the
deliberate exception to "avoid standalone comments" — they carry the _why_ that
cannot live in a name.

---

## 20. Where to add things

| You want to…                         | Put it…                                                                                                                                     |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Call a new endpoint                  | `data-provider/<Feature>/queries.ts` or `mutations.ts` → `<Feature>/index.ts` → `data-provider/index.ts`                                    |
| Add a shared endpoint/type/service   | `packages/data-provider` (`api-endpoints.ts`, `types/queries.ts`, `data-service.ts`, `keys.ts`), then `npm run build:data-provider`         |
| Hold new state                       | `store/` — a value or selector only. Recoil for conversation-shaped state, Jotai for preferences and high-frequency per-conversation values |
| Coordinate state, queries or effects | `hooks/<Domain>/` — the folder named after the thing being manipulated                                                                      |
| Share behaviour down a subtree       | `Providers/`, typed as `ReturnType<typeof theHook>`                                                                                         |
| Add a pure decision                  | `utils/` — and unit-test it there, not through a component                                                                                  |
| Add UI                               | the feature directory under `components/`. A genuinely new primitive belongs in `@librechat/client`, not `components/ui/`                   |
| Add a route                          | `routes/index.tsx`, under the correct auth subtree; `lazy:` if it pulls a heavy dependency tree                                             |
| Add user-facing text                 | `src/locales/en/translation.json` with a `com_*` key, read via `useLocalize()`                                                              |
| Add a theme value                    | the token registry in `packages/client` — not a local class string                                                                          |
| Add backend logic                    | `packages/api` (TypeScript). Keep `/api` changes to thin JS wrappers                                                                        |

---

## Further reading

| Document                                   | Covers                                                          |
| ------------------------------------------ | --------------------------------------------------------------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md)     | The layer model and dependency direction, condensed             |
| [`docs/state.md`](./docs/state.md)         | The Recoil/Jotai split, keying, persistence, usage accounting   |
| [`docs/streaming.md`](./docs/streaming.md) | The full generation lifecycle                                   |
| [`docs/rendering.md`](./docs/rendering.md) | The message tree and the performance model                      |
| [`../CLAUDE.md`](../CLAUDE.md)             | Repository-wide conventions and workspace boundaries            |
| [`../CONTEXT.md`](../CONTEXT.md)           | Domain vocabulary                                               |
| File headers                               | Every source file states its purpose, rationale and connections |
