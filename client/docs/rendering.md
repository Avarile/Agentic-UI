# Rendering messages

The message list is the most expensive subtree in the client, and it re-renders
on every streamed token. Most of the non-obvious code in `components/Chat/Messages/`
and `components/Messages/` exists to keep that cheap.

## Messages are a tree

Messages are stored flat with `parentMessageId` pointers. Branching — regenerate,
edit-and-resubmit, fork — makes a conversation a tree, not a list.

```
utils/buildTree.ts        flat list + file map → parent/child tree.  Hydrates
                          each message's file references in the SAME pass, so
                          attachments need no per-file lookup later.
        ↓
MultiMessage              recursive walk; picks which sibling to show at each
                          branch point
        ↓
one of three renderers    by message shape
```

Every streaming write produces fresh `children` arrays. That is what lets the
recursion re-render only the *spine* leading to the changed message while settled
rows bail out of their memo comparators.

### The three renderers

| Shape | Renderer | Lives in |
|---|---|---|
| assistants endpoint + `content[]` | `MessageParts` | `components/Chat/Messages/` |
| `content[]` (standard endpoints) | `MessageContent` | `components/Messages/` |
| legacy `text` only | `Message` | `components/Chat/Messages/` |

The directory split is meaningful. `components/Chat/Messages/` is chat-specific
row and tree machinery. `components/Messages/` holds the chat-**agnostic**
primitives — code blocks, mermaid, markdown container, the standard content
renderer — reused by the share route, search results and the artifacts panel,
none of which have a live chat around them. That is why
`Providers/CustomFormContext` exposes a non-throwing
`useOptionalCustomFormContext`: the same components must render with no composer
above them.

---

## Two decisions in `MultiMessage` worth understanding before editing it

### 1. Rows are rendered without a React `key`

A streaming message's id changes three times: client UUID → created-handler id →
server id. Neither is stable, so **with** a key React unmounts and remounts the
entire subtree on each SSE event — destroying memoized state and flickering
visibly. Without one, React reuses the instance and updates props in place.

This is safe because the row wrappers and `MessageRender`/`ContentRender` are
memoized with field-level comparators, and a sibling switch changes the `message`
prop entirely.

### 2. Sibling selection reconciles by identity, not by reset

Sibling selection is *positional* (a reversed index), so any change to a level's
children array would silently change what is displayed. Blanket-resetting on
change is wrong; so is ignoring the change. The effect distinguishes:

- an **appended** newest child means a submission landed here — send, regenerate
  and edit-resubmit all append — so follow it (the long-standing behaviour). An
  append is a newest-id change where the *prior* newest still exists.
- a newest id that changed while the previous one **vanished** is the same row
  being re-keyed mid-stream, and must not move the selection.

`UNBOUND_PARENT` is a `Symbol` sentinel because `messageId` may legitimately be
`null`/`undefined` at the root, so neither can mark "not yet bound".

### 3. The child recursion is a sibling of the row, not nested inside it

If the recursion were rendered *inside* the row, a row that bailed out via its
memo comparator would sever the walk that delivers streaming updates to its
descendants.

---

## The four performance mechanisms

### 1. Block-level memoization

`components/Chat/Messages/Content/MarkdownBlocks.tsx` splits a markdown document
into independently memoized blocks. During generation only the last block changes,
so re-rendering the whole document per token is wasted work that **grows with
message length**. Splitting makes a long answer cost the same per token as a short
one.

`components/Chat/Messages/Content/splitMarkdown.ts` holds the rules for where a document may be divided
without changing how it parses — pure, because a split inside a fence or a table
corrupts the output.

This is also why the index-assigning providers take a `baseIndex`:
`ArtifactContext` and `CodeBlockContext` count artifacts and code fences in
document order, and each block gets its own provider seeded with the running count
from earlier blocks. A single shared counter would be defeated by memoization.
`CodeBlockContext` keeps a *second* sequence for mermaid fences, which the
executable-code counter skips; both reset together, because a streaming block
re-renders its fences on every token and restarting is what keeps a diagram's
index tied to its position rather than drifting upward as the message grows.

### 2. Field-level comparators

`areMessageFieldsEqual` / `areMessageRowPropsEqual` (`utils/messages.ts`). The
message object is a fresh reference on every streamed write, so shallow equality
never bails and the whole tree would re-render.

### 3. Narrow subscriptions

| Seam | Why |
|---|---|
| `MessagesViewContext` | re-exports only the fields the list needs, in four separately memoized clusters (conversation, submission state, operations, message state), so a change in one does not produce new identities for the others |
| `useLatestMessage` | split into `useLatestMessage` / `useLatestMessageId` / `useLatestMessageMeta`, so a consumer needing only an id for an equality check does not subscribe to a whole message |
| `EditorContext` | split into `CodeContext` (every keystroke) and `MutationContext` (rare), so typing does not re-render the toolbar |
| `MessageContext` | per-message identity and render flags, so `isSubmitting`/`isLatestMessage` cost is paid only by the streaming message |
| `useMemoizedChatContext` | a memoized ChatContext slice for message subtrees |

### 4. Isolated re-render hosts

Components that exist purely to confine a subscription, exploiting the fact that
Recoil subscriptions do not propagate to parents:

- `ScrollButton` inside `MessagesView` — owns the IntersectionObserver and the
  button's visibility state, so a scroll-position flip re-renders a button rather
  than the message tree.
- `SidebarChatProvider` inside `UnifiedSidebar` — the sidebar needs its own chat
  context (its panels can start conversations), but subscribing at the shell level
  would re-render the rail and the resize logic on every token.

---

## Scrolling

`hooks/Messages/useMessageScrolling.ts`. Auto-follow the bottom while streaming,
yield the moment the user scrolls. The thresholds are **asymmetric on purpose**:

```
detachThreshold  24px    leaving the bottom — detected tightly, so a deliberate
                         scroll up hands over control immediately
attachThreshold  150px   returning to it — detected loosely, because while an
                         answer streams the bottom is a MOVING TARGET: it recedes
                         between the reader's last wheel tick and the frame that
                         measures position, so someone scrolling all the way down
                         still lands tens of pixels short
```

Symmetric thresholds mean the reader can never quite catch the bottom.
`glideTimeout` (700ms) gives a programmatic smooth scroll time to land before
per-frame following resumes, so the two do not fight, and `prefersReducedMotion`
swaps glides for jumps.

`hooks/Messages/useMessageProcess.tsx` is the handover: a throttled scroll handler
sets `abortScroll` to whatever `isSubmitting` currently is — so a scroll *during*
generation stops the follow and a scroll after it finishes does not.
`isSubmitting` is read through a ref so the throttled handler keeps a stable
identity; re-creating it would reset the throttle window.

### Content that changes size after layout

`hooks/Messages/messageLayout.ts`. Expanding a tool output or a code block changes
a message's height *after* the browser has laid out the scroll container, so the
follow logic would compute against a stale maximum.
`getRenderedContentMaxScrollTop` measures what is actually rendered rather than
trusting `scrollHeight`, and a **custom DOM event**
(`librechat:message-content-layout-change`) lets any content component announce a
size change. An event rather than state, because publisher and subscriber are
arbitrarily far apart and the signal must not itself cause a React render.

---

## Content parts

`ContentParts.tsx` is the fan-out point for everything a message can contain:
text, reasoning, tool calls, artifacts, images, search results, approvals,
questions. Part order is document order, which is why the index-assigning
providers wrap this rather than individual parts.

Grouping happens before rendering, so long runs stay readable:

| Helper | Collapses |
|---|---|
| `utils/groupToolCalls.ts` | consecutive tool calls into one block |
| `utils/activityLabels.ts` | consecutive activity labels into named phases with start/end indices |
| `ParallelContent.tsx` | parts sharing a `groupId`, laid out side by side (detected by `useContentMetadata`) |

Error containment is per-part, not per-message: `MarkdownErrorBoundary` and
`MermaidErrorBoundary` exist because streaming content is frequently mid-syntax.
Without them one malformed fence would blank the conversation. For mermaid
specifically, failures are *expected* — the diagram source streams in, so most
intermediate states are invalid — and are rendered as a quiet placeholder rather
than an error.

---

## Virtualized surfaces

Not the chat (which relies on memoization instead), but three lists that do
window:

- **Search results** (`routes/Search.tsx`) — `react-virtualized` with a
  `CellMeasurerCache`. Every way a row's height can change after measurement needs
  an explicit invalidation: a new query (drop all *and* scroll to top, since
  `keepPreviousData` leaves the old list at its old scrollTop), a font-size change
  (drop all, keep position), an appended page (keep measures), any other content
  change at the same row count (drop all), a container width change (the cache is
  `fixedWidth`, so heights are keyed by row only), and a single row growing later
  (a per-row `ResizeObserver` catches the late image or expanded tool output).
  Rows are keyed by `messageId`, not react-virtualized's positional `key`, so
  React reconciles by message rather than by slot.
- **Agent marketplace** (`VirtualizedAgentGrid`) — uses `useVirtualGrid` for the
  column arithmetic a row-based virtualizer needs to render a grid.
- **Conversation list** — `useNavScrolling`, cursor-paginated with position
  preserved across appends.

---

## The minimap

`components/Chat/Messages/MessageNav.tsx` is a vertical strip of ribs, one per
message, with pointer-proximity magnification, preview tooltips and drag-to-scrub.

Its entries are derived from the **DOM** (`.message-render`, `.steer-render`)
rather than from the message tree, and that is the central decision: what the
minimap must reflect is what is actually laid out and scrollable — including steer
rows and rows whose ids are still in flux mid-stream. `buildEntry` uses the
message record when one is found by id and `buildFallbackEntry` reads the node
when it is not, so a rendered row always gets a rib.

Scrolling is hand-rolled rather than native smooth scroll because the target must
account for scroll margin and for content that grows while the animation runs —
hence `BOTTOM_SNAP_RETRIES` for the moving bottom.
