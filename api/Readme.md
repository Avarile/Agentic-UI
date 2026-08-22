# Backend Architecture (`/api`)

The Express server that powers LibreChat: HTTP surface, authentication and
authorization, the agent chat pipeline, file storage, MCP/tool integration, and the
data layer.

> **Every source file in this tree carries a header comment** describing its purpose,
> why it is designed that way, and what it connects to. This document is the map;
> the file headers are the territory. When they disagree, the file header is closer
> to the code.

---

## Contents

1. [Mental model](#1-mental-model)
2. [Workspace boundaries — where new code goes](#2-workspace-boundaries--where-new-code-goes)
3. [Directory map](#3-directory-map)
4. [Boot sequence](#4-boot-sequence)
5. [Request lifecycle](#5-request-lifecycle)
6. [Route map](#6-route-map)
7. [Authentication (identity)](#7-authentication-identity)
8. [Authorization (three systems)](#8-authorization-three-systems)
9. [Middleware reference](#9-middleware-reference)
10. [The chat pipeline](#10-the-chat-pipeline)
11. [Subsystems](#11-subsystems)
12. [Cross-cutting concerns](#12-cross-cutting-concerns)
13. [Load-order traps and gotchas](#13-load-order-traps-and-gotchas)
14. [Testing](#14-testing)
15. [Commands and environment](#15-commands-and-environment)

---

## 1. Mental model

The backend is a conventional Express application with one unconventional part: the
**chat pipeline**, which is a long-lived, resumable, streaming job rather than a
request/response handler.

```
            HTTP request
                 │
       ┌─────────▼──────────┐
       │  global middleware │   context, metrics, parsing, sanitizing, static
       └─────────┬──────────┘
                 │
       ┌─────────▼──────────┐
       │      routes/       │   URL shape + middleware chain (the policy)
       └─────────┬──────────┘
                 │
       ┌─────────▼──────────┐
       │   controllers/     │   HTTP concerns: validate, respond, stream
       └─────────┬──────────┘
                 │
       ┌─────────▼──────────┐
       │    services/       │   business logic, external systems
       └─────────┬──────────┘
                 │
       ┌─────────▼──────────┐
       │  models/  (~/models)│  every DB method, from packages/data-schemas
       └─────────┬──────────┘
                 │
              MongoDB
```

Two rules explain most of the code you will read:

- **Routes are where policy lives.** A route's middleware chain — its order — _is_
  the security model for that endpoint. Read the chain top to bottom before reading
  the handler.
- **`/api` is a thin JavaScript wrapper.** New backend logic belongs in
  `packages/api` as TypeScript. Much of what looks like a service here is a binding
  that injects this app's dependencies into a factory defined in `packages/api`.

### Layer responsibilities

| Layer          | Owns                                                   | Must not                        |
| -------------- | ------------------------------------------------------ | ------------------------------- |
| `routes/`      | URL shape, middleware order, rate limits               | Contain business logic          |
| `controllers/` | Request validation, response shaping, streaming        | Talk to MongoDB directly        |
| `services/`    | Business logic, external systems, orchestration        | Know about `req`/`res` (mostly) |
| `models/`      | Data access (re-exported from `packages/data-schemas`) | Contain app policy              |
| `middleware/`  | Cross-cutting request concerns                         | Be feature-specific             |

---

## 2. Workspace boundaries — where new code goes

This repo is a monorepo. `/api` is the legacy JavaScript Express server, and it is
deliberately being kept thin.

| Workspace                 | Language       | Purpose                                                        |
| ------------------------- | -------------- | -------------------------------------------------------------- |
| `/api`                    | JS (legacy)    | Express server — **minimize changes here**                     |
| `/packages/api`           | **TypeScript** | New backend code lives here, consumed by `/api`                |
| `/packages/data-schemas`  | TypeScript     | DB models/schemas/methods, shareable across backends           |
| `/packages/data-provider` | TypeScript     | Shared types/endpoints/data-service (frontend **and** backend) |
| `/client`                 | TS/React       | Frontend SPA                                                   |
| `/packages/client`        | TypeScript     | Shared frontend utilities                                      |

**Decision rule for new backend work:**

- Business logic, helpers, validation → `packages/api` (TypeScript), then a thin
  binding in `/api`.
- Database schemas or methods → `packages/data-schemas`.
- Types or endpoints shared with the frontend → `packages/data-provider`.
- Only the Express wiring — a route, a middleware mount, a dependency injection —
  belongs in `/api`.

`@librechat/agents` is a major backend dependency maintained by the same team; it
provides the LangGraph-based agent runtime.

### The binding pattern

You will see this shape constantly. It is intentional, not boilerplate:

```js
// server/middleware/messageValidation.js
module.exports = createMessageRequestMiddleware({
  getConvo, // from ~/models
  getJob: (id) => GenerationJobManager.getJob(id),
  isPendingActionStale,
  logger,
});
```

The _rules_ live in TypeScript in `packages/api` where they are unit-testable
without Express; `/api` supplies the runtime dependencies. This inversion is why
`packages/api` and `packages/data-schemas` stay free of app-level imports.

---

## 3. Directory map

Approximate non-test source file counts:

```
api/
├── server/                 272   the application
│   ├── index.js                  ← entry point; read this first
│   ├── experimental.js           clustered variant (copy, not authoritative)
│   ├── routes/          65       URL surface + middleware chains
│   ├── services/        91       business logic
│   ├── middleware/      64       cross-cutting request concerns
│   ├── controllers/     33       HTTP handlers
│   ├── utils/           14       helpers (email, queue, static cache, import)
│   ├── cleanup.js                explicit teardown of per-request object graphs
│   ├── socialLogins.js           conditional social/SSO strategy registration
│   └── telemetry.js              OpenTelemetry on/off switch
├── app/                    34   legacy client layer (BaseClient, prompts, tools)
├── strategies/             15   Passport authentication strategies
├── cache/                   5   namespaced Keyv stores, violation/ban accounting
├── db/                      5   Mongoose connection + MeiliSearch index sync
├── config/                  4   credentials bootstrap, paths, MCP singletons
├── models/                  1   the data-access surface (~/models)
├── utils/                   2   auth-specific logging
├── typedefs.js                  JSDoc type registry (no runtime code)
└── jest.config.js
```

Two path conventions:

- `~/` resolves to `api/` — via `module-alias` at runtime (declared in
  `package.json` `_moduleAliases`) and via `moduleNameMapper` in `jest.config.js`.
- Single-word filenames are preferred. Where several words are needed, group under a
  single-word directory (`admin/capabilities.ts`, not `adminCapabilities.ts`) — the
  directory supplies the context.

---

## 4. Boot sequence

`server/index.js` is the entry point, and **the order of operations in
`startServer()` is the architecture.** It is load-bearing, not stylistic.

```
1.  require('../config/credentials')   ← line 1: loads .env, validates crypto keys
2.  require('./telemetry')             ← line 3: OTel must patch http/express/
                                          mongoose BEFORE they are required
3.  module-alias                       registers the `~` → api/ prefix
4.  connectDb()                        MongoDB (memoized on global.mongoose)
5.  indexSync().catch(...)             fire-and-forget — a slow MeiliSearch must
                                          never delay the HTTP listener
6.  runAsSystem(seedDatabase)          roles, default roles, categories, grants
7.  sweepOrphanedPreviews()            recover `status: 'pending'` rows from a crash
8.  getAppConfig({ baseOnly: true })   base configuration layer
9.  initializeFileStorage(appConfig)
10. initializeDeploymentPlugins()      opt-in via DEPLOYMENT_PLUGIN_HOOKS
11. setPluginHookSource()              avoids an agents → plugins package import
12. initializeDeploymentSkills()
13. initializeGitHubSkillSync()
14. startExpiredFileSweep()
15. loadToolApprovalHooks()            honors the `enabled` kill switch
16. performStartupChecks()             + updateInterfacePermissions()
17. read + cache index.html            once, in memory
18. ── middleware, routes, error handler ──
19. app.listen()
20. AFTER listening:
      initializeMCPs()                 remote MCP connections can be slow
      initializeOAuthReconnectManager()
      checkMigrations()                warns only, never migrates
      serverReady = true
```

### Two-phase readiness

Startup is split because remote MCP servers can take a long time to connect, and a
rolling deploy must not route conversations into a half-initialized process.

| Endpoint            | Answers                                               |
| ------------------- | ----------------------------------------------------- |
| `/health`, `/livez` | As soon as the process is listening                   |
| `/readyz`           | Only after post-listen init completes (`serverReady`) |

`rejectChatStartsUntilReady` is mounted on `/api/agents/chat` and returns **503 with
`Retry-After: 1`** for new chat `POST`s during that window — while still letting
`/abort` through, so a client can always cancel.

### Failure policy

Deliberately three different behaviors:

- **Boot errors → exit.** `startServer().catch(() => process.exit(1))`, _and_ the
  same inside the async `app.listen` callback. A partially initialized process that
  passes liveness checks while serving broken requests is worse than a crash the
  orchestrator can restart.
- **`unhandledRejection` → log and continue.** MCP OAuth reconnect storms and
  streamable-HTTP transport resets produce transient, recoverable rejections.
  Non-`Error` reasons are forwarded as-is so structured payloads survive instead of
  collapsing to `"[object Object]"`.
- **`uncaughtException` → curated allow-list.** Known-unfixable upstream noise
  (`GoogleGenerativeAI`, Meilisearch `fetch failed`, abort errors, errors originating
  in `@librechat/agents`) is logged and swallowed; anything else exits unless
  `CONTINUE_ON_UNCAUGHT_EXCEPTION` is set.

---

## 5. Request lifecycle

Global middleware, in registration order. Order matters at nearly every step.

| #   | Middleware                           | Why here                                                                           |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| 1   | `requestContextMiddleware`           | Establishes the async-local request/tenant context **everything** downstream reads |
| 2   | `agentStartupIngressMiddleware`      | Scoped to `/api/agents/chat`; measures startup latency from ingress                |
| 3   | `metricsMiddleware`                  | Prometheus counters, before any early return                                       |
| 4   | `noIndex`                            | `X-Robots-Tag: noindex` unless `NO_INDEX=false`                                    |
| 5   | `express.json` / `urlencoded`        | 3 MB limit                                                                         |
| 6   | `handleJsonParseError`               | Turns a malformed body into a clean 400                                            |
| 7   | `req.query` writability shim         | **Express 5 makes `req.query` read-only; `express-mongo-sanitize` must mutate it** |
| 8   | `mongoSanitize()`                    | Strips `$`/`.` operators from input                                                |
| 9   | `cors()`                             |                                                                                    |
| 10  | `cookieParser()`                     | Required by the auth strategies below                                              |
| 11  | `compression()`                      | Unless `DISABLE_COMPRESSION`                                                       |
| 12  | `staticCache(dist / fonts / assets)` | Precompressed assets, long cache lifetimes                                         |
| 13  | `telemetryMiddleware`                | If telemetry enabled                                                               |
| 14  | `passport.initialize()` + strategies | `jwtLogin`, `passportLogin`, LDAP and social when configured                       |
| 15  | `capabilityContextMiddleware`        | **Must precede any route calling `hasCapability`** — installs the per-request memo |
| 16  | _routes_                             | See the route map below                                                            |
| 17  | `apiNotFound` on `/api`              | JSON 404 for unmatched API routes                                                  |
| 18  | `createSpaFallback`                  | `index.html` for unmatched routes, **404 for missing static assets**               |
| 19  | `telemetryErrorMiddleware`           | Records trace errors                                                               |
| 20  | `ErrorController`                    | **Last** — Express identifies error middleware by its 4-arg signature              |

Two of these are worth internalizing:

- **Step 7** exists purely for Express 5 compatibility. Removing it silently disables
  input sanitization.
- **Step 18** must 404 missing assets rather than serve HTML. Returning
  `index.html` with a JavaScript content type fails strict MIME checking _and_ gets
  cached by the browser and any service worker — so the app stays broken after the
  real asset is deployed. See `server/utils/fallback.js`.

### Per-request context objects

| Property           | Set by                               | Contains                                                    |
| ------------------ | ------------------------------------ | ----------------------------------------------------------- |
| `req.user`         | `requireJwtAuth` / `optionalJwtAuth` | Authenticated user, sensitive fields projected out          |
| `req.config`       | `configMiddleware`                   | Resolved app config for this user's role/tenant             |
| `req.authStrategy` | the JWT middlewares                  | `'jwt'` or `'openidJwt'`                                    |
| `req.invite`       | `checkInviteUser`                    | Consumed registration invite (bypasses closed registration) |

---

## 6. Route map

Mount paths live in `server/index.js`, not in the routers. Keeping URL layout in one
file makes the public surface reviewable at a glance, and lets a router be mounted
with different pre-middleware without knowing about it.

| Mount                                                                                                     | Router                  | Notes                                                           |
| --------------------------------------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------- |
| `/oauth`                                                                                                  | `oauth.js`              | Social/SSO redirects + callbacks. `preAuthTenantMiddleware`     |
| `/api/auth`                                                                                               | `auth.js`               | Login, register, refresh, reset, 2FA. `preAuthTenantMiddleware` |
| `/api/admin`                                                                                              | `admin/auth.js`         | Admin login surface (separate strategies)                       |
| `/api/admin/config`                                                                                       | `admin/config.js`       | Layered config overrides                                        |
| `/api/admin/grants`                                                                                       | `admin/grants.js`       | Capability grants                                               |
| `/api/admin/groups`                                                                                       | `admin/groups.js`       |                                                                 |
| `/api/admin/roles`                                                                                        | `admin/roles.js`        | Roles as entities                                               |
| `/api/admin/skills`                                                                                       | `admin/skills.js`       | GitHub skill sync                                               |
| `/api/admin/users`                                                                                        | `admin/users.js`        | Read-only                                                       |
| `/api/admin/audit-log`                                                                                    | `admin/audit.js`        | Requires `READ_AUDIT_LOG` **and** `ACCESS_ADMIN`                |
| `/api/admin/langfuse`                                                                                     | `admin/langfuse.js`     | Observability connection                                        |
| `/api/agents`                                                                                             | `agents/index.js`       | **The chat pipeline.** See §10                                  |
| `/api/assistants`                                                                                         | `assistants/index.js`   | OpenAI Assistants v1 + v2                                       |
| `/api/messages`                                                                                           | `messages.js`           | Message CRUD, edit, branch, feedback, artifacts                 |
| `/api/convos`                                                                                             | `convos.js`             | Conversations, archive, pin, fork, import                       |
| `/api/files`                                                                                              | `files/index.js`        | **Mounted via `await routes.files.initialize()`**               |
| `/images/`                                                                                                | `static.js`             | Behind `createValidateImageRequest`                             |
| `/api/share`                                                                                              | `share.js`              | Public shared links. `preAuthTenantMiddleware`                  |
| `/api/config`                                                                                             | `config.js`             | `preAuthTenantMiddleware` + `optionalJwtAuth` (pre-login)       |
| `/api/permissions`                                                                                        | `accessPermissions.js`  | Generic resource sharing (any resource type)                    |
| `/api/mcp`                                                                                                | `mcp.js`                | MCP servers, tools, OAuth handshake                             |
| `/api/skills`                                                                                             | `skills.js`             | Skill CRUD, files, GitHub import                                |
| `/api/prompts`                                                                                            | `prompts.js`            | Prompts + prompt groups                                         |
| `/api/memories`                                                                                           | `memories.js`           | Long-term memory                                                |
| `/api/user`                                                                                               | `user.js`               | Profile, terms, plugins, deletion; mounts `/settings`           |
| `/api/roles`                                                                                              | `roles.js`              | Per-feature role permissions                                    |
| `/api/endpoints`                                                                                          | `endpoints.js`          | Endpoint config + token/context limits                          |
| `/api/models`                                                                                             | `models.js`             | Available models                                                |
| `/api/balance`                                                                                            | `balance.js`            | Token balance                                                   |
| `/api/keys`, `/api/api-keys`                                                                              | `keys.js`, `apiKeys.js` | BYOK provider keys; agent API keys                              |
| `/api/actions`                                                                                            | `actions.js`            | Action (OpenAPI tool) OAuth                                     |
| `/api/presets`, `/api/projects`, `/api/tags`, `/api/categories`, `/api/banner`, `/api/search`, `/api/rum` |                         | Supporting surfaces                                             |
| `/metrics`                                                                                                | `metricsRouter`         | Guarded by `METRICS_SECRET`                                     |

**Pre-authentication routes** — the four reachable before login, all given
`preAuthTenantMiddleware` because they still need tenant scoping from the
`X-Tenant-Id` header set by the reverse proxy: `/oauth`, `/api/auth`, `/api/config`,
`/api/share`.

---

## 7. Authentication (identity)

Strategies are registered as **factories**, not instances — construction reads
`process.env` and (for OpenID/SAML) performs network discovery, so it must happen
lazily and only for providers the operator enabled.

| Strategy                                               | File                              | Used for                                             |
| ------------------------------------------------------ | --------------------------------- | ---------------------------------------------------- |
| `jwt`                                                  | `strategies/jwtStrategy.js`       | Every normal authenticated API request               |
| `openidJwt`                                            | `strategies/openIdJwtStrategy.js` | IdP-issued access tokens (`OPENID_REUSE_TOKENS`)     |
| `local`                                                | `strategies/localStrategy.js`     | Email + password                                     |
| `ldapauth`                                             | `strategies/ldapStrategy.js`      | LDAP / Active Directory                              |
| `openid`                                               | `strategies/openidStrategy.js`    | OIDC authorization code (largest, most configurable) |
| `saml`                                                 | `strategies/samlStrategy.js`      | SAML 2.0                                             |
| `google` / `github` / `discord` / `facebook` / `apple` | `strategies/*Strategy.js`         | OAuth2 social                                        |

### The social-login funnel

Every social provider supplies **only** a `getProfileDetails` normalizer. All account
resolution and policy lives once in `strategies/socialLogin.js`:

```
getProfileDetails(idToken, profile)
        │
        ▼
domain allow-list check (base config)     ← before any user lookup
        │
        ▼
find by provider id (googleId, githubId…) ← stable identifier
        │  (miss)
        ▼
find by email + warn                      ← weaker match, re-checked below
        │
        ▼
domain allow-list check (tenant config)   ← a tenant may narrow the list
        │
        ▼
handleExistingUser  |  createSocialUser   ← strategies/process.js
```

Notable decisions:

- The allow-list is checked **twice** on purpose — once pre-lookup against base
  config, once post-lookup against the tenant-resolved config.
- An account owned by a _different_ provider produces an error carrying
  `error.provider`, so the UI can say which provider to use.
- Avatars are stored with a `?manual=true` marker when user-uploaded; provider
  logins must not overwrite them on every sign-in.

### Token model

| Credential              | Lifetime       | Backed by                                                                                                 |
| ----------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| Access token (JWT)      | Short          | `JWT_SECRET`, stateless                                                                                   |
| Refresh token           | Long, rotating | **A session row** — this is what makes logout and ban revocation immediate rather than deferred to expiry |
| CloudFront auth cookies | Session        | Signed media URLs                                                                                         |
| 2FA temp token          | Minutes        | Bridges password → TOTP verification                                                                      |

`strategies/jwtStrategy.js` projects out `password`, `__v`, `totpSecret` and
`backupCodes` so no route can accidentally serialize them, and sets
`idOnTheSource ??= null` — on a full user document, _absent_ means a local user, and
`null` short-circuits a directory fallback lookup on every authenticated request.

### Two-factor authentication

Deliberately two-phase, so a user cannot lock themselves out with a misconfigured
authenticator app:

```
POST /api/auth/login          → { twoFAPending: true, tempToken }   (no auth tokens!)
POST /api/auth/2fa/verify-temp → setTwoFactorTempUser → limiter → verify → tokens

POST /api/auth/2fa/enable     stores secret, 2FA still DISABLED
POST /api/auth/2fa/confirm    proves a valid code → flips it ON
```

Backup codes are stored hashed and single-use. Re-enrolling while 2FA is already on
requires an OTP or backup code first, so a hijacked session cannot silently replace
the second factor.

### Admin authentication is separate

`/api/admin` uses distinct `<provider>Admin` Passport strategies configured with
`existingUsersOnly: true`. Admin sign-in must **never** auto-provision an account,
and making that a different _strategy_ rather than a request-time flag means the
guarantee cannot be bypassed by a crafted request. Admin callbacks are registered at
`/api/admin/oauth/<provider>/callback`, so IdP registration for admin access is
locked down independently.

---

## 8. Authorization (three systems)

This is the part most likely to confuse. There are **three** independent
authorization systems, and most protected endpoints use two of them stacked.

| System                    | Question it answers                                | Storage            | Entry point                                            |
| ------------------------- | -------------------------------------------------- | ------------------ | ------------------------------------------------------ |
| **Role permissions**      | May this _role_ use this feature at all?           | Role document      | `generateCheckAccess({ permissionType, permissions })` |
| **Capabilities (grants)** | May this _principal_ perform this system action?   | Grant rows         | `requireCapability(SystemCapabilities.X)`              |
| **Resource ACLs**         | May this principal do X to _this specific object_? | ACL rows (bitmask) | `canAccess*Resource({ requiredPermission })`           |

### Why all three

They answer different questions and neither subsumes the others:

- Role permission alone would not stop you reading **someone else's** prompt.
- ACL alone would not let an operator **disable the prompts feature** for a role.
- Capabilities are for **system actions** with no single resource (read the audit
  log, manage roles, access the admin console) and are inherited across principal
  types (user ← groups ← roles).

A typical stacked chain, from `server/routes/prompts.js`:

```js
router.use(requireJwtAuth); // identity
router.use(checkPromptAccess); // role permission: PROMPTS / USE
// …then per route:
canAccessPromptGroupResource({ requiredPermission: PermissionBits.EDIT });
```

### Resource ACLs in detail

Permissions are a **bitmask**, so one stored value expresses a set and a check is a
mask test rather than a list scan:

| Bit      | Value | Meaning           |
| -------- | ----- | ----------------- |
| `VIEW`   | 1     | View and use      |
| `EDIT`   | 2     | Modify settings   |
| `DELETE` | 4     | Delete            |
| `SHARE`  | 8     | Share with others |

`ResourceType`: `agent`, `promptGroup`, `mcpServer`, `remoteAgent`, `skill`,
`sharedLink`.

Everything is built on one generic factory,
`server/middleware/accessResources/canAccessResource.js`:

```js
canAccessResource({ resourceType, requiredPermission, resourceIdParam, idResolver });
```

The `idResolver` is the extension point that makes one implementation serve every
resource. ACL rows are keyed by MongoDB `ObjectId`, but routes address resources by
custom string ids — so each specialization supplies a translator:

| Specialization                 | Resolves                      | Notable behavior                                                                        |
| ------------------------------ | ----------------------------- | --------------------------------------------------------------------------------------- |
| `canAccessAgentResource`       | `agent_abc123` → ObjectId     | Path-based                                                                              |
| `canAccessAgentFromBody`       | body `agent_id` → ObjectId    | Chat endpoints; `isEphemeralAgentId` short-circuits (no ACL row exists)                 |
| `canAccessPromptGroupResource` | groupId → ObjectId            | Groups own permissions                                                                  |
| `canAccessPromptViaGroup`      | promptId → **its group's** id | Avoids duplicating ACL rows per prompt                                                  |
| `canAccessMCPServerResource`   | server _name_ → ObjectId      | MCP servers are named everywhere                                                        |
| `canAccessSkillResource`       | skillId → ObjectId            | Plus a **deployment-skill exemption** — those ship with the install and have no ACL row |
| `fileAccess`                   | fileId                        | Grants access via **an agent the caller can reach**                                     |

### Permission inheritance — the two important cases

**Files inherit from agents.** A user chatting with a shared agent must be able to
read the files in that agent's `tool_resources`. `fileAccess` grants access if
_either_ the direct file ACL permits it _or_ the file appears in the tool resources
of an accessible agent — `$or`-ing across every bucket (`execute_code`,
`file_search`, `image_edit`, `context`, `ocr`) in a single query. Without this,
sharing an agent would silently break every file it depends on.

**Prompts inherit from prompt groups.** Groups are the sharing unit users reason
about, so `canAccessPromptViaGroup` resolves a prompt to its `groupId` rather than
maintaining per-prompt ACL rows that would need syncing on move/share.

### The capability import trap

```js
// ✅ correct
const { hasCapability } = require('~/server/middleware/roles/capabilities');

// ❌ silently returns an empty object
const { hasCapability } = require('~/server/middleware');
```

`roles/capabilities.js` depends on `~/models`, and the middleware barrel is required
by modules that load while it is still initializing. Going through the barrel creates
a circular require that yields an empty exports object — with no error. This is
documented in `server/middleware/roles/index.js`, which deliberately does **not**
re-export the capability helpers.

---

## 9. Middleware reference

### Authentication

| Middleware                             | Behavior                                                                                                    |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `requireJwtAuth`                       | Rejects unauthenticated. Selects `jwt` or `openidJwt` per request by cookie. Establishes tenant ALS context |
| `optionalJwtAuth`                      | Same selection, but never rejects — for routes serving both signed-in and anonymous callers                 |
| `optionalShareFileAuth`                | Resolves a viewer for shared-link files; verifies a refresh cookie **and** confirms a live session row      |
| `requireLocalAuth` / `requireLdapAuth` | Callback form, so "no user" (404) and a user-facing `info.message` (422) map to distinct responses          |
| `setTwoFactorTempUser`                 | Populates `req.user` from a 2FA temp token; deliberately non-failing                                        |

### Authorization

`checkAdmin` (coarse, legacy — prefer capabilities) · `canDeleteAccount` ·
`checkSharePublicAccess` · `canAccessSharedLink` · `checkPeoplePickerAccess`
(authorizes per requested principal _type_) · the `accessResources/*` family.

### Validation

`buildEndpointOption` (normalizes a chat body; applies model specs **before**
validation so a spec cannot be bypassed) · `validateModel` (syntactic check → cap →
pattern, before any lookup) · `messageValidation` · `validateConvoAccess` ·
`assistants/validate`.

### Abuse and safety

| Middleware                      | Notes                                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkBan`                      | Looks up bans by **both** user id and IP. Chat routes get the ban as a _message_ via `denyRequest`; others get a plain 403                                          |
| `moderateText`                  | Optional OpenAI moderation. Moderates typed text, each quote, **and** the merged string — content split across a quote and the body would slip past per-part checks |
| `uaParser`                      | Rejects non-browser User-Agents; scores 20 by default. A deterrent, not a security control                                                                          |
| `logViolation` → `banViolation` | Threshold-crossing (not modulo) so a multi-step jump triggers exactly one ban and skips no step                                                                     |

**16 rate limiters** in `middleware/limiters/`. Ones with fixed policy are exported
as instances; ones whose windows come from config are exported as **factories**
(`createTTSLimiters`, `createSTTLimiters`, `createFileLimiters`,
`createImportLimiters`, `createForkLimiters`). All share the pattern: an
`express-rate-limit` instance over `limiterCache` (shared Redis/Mongo store, so
limits hold across replicas), keyed by `removePorts(req)` for IP or `req.user.id`
for user, with a handler that logs a violation before responding 429.

Selected defaults:

| Limiter                                   | Default            | Rationale                                                                                                        |
| ----------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `loginLimiter`                            | 7 / 5 min per IP   | Credential stuffing                                                                                              |
| `registerLimiter`                         | 5 / 60 min per IP  | Tighter — primary defense against bulk account creation                                                          |
| `messageIpLimiter` / `messageUserLimiter` | 40 / min each      | Both mounted; respond via `denyRequest` because the SSE stream is already open                                   |
| `toolCallLimiter`                         | 1 / sec per user   | A debounce, not a quota — each call may execute code                                                             |
| `resetPassword` / `verifyEmail`           | 2 / 2 min          | Each request sends mail. **Request** and **submission** are limited separately (mail spam vs. token brute force) |
| `twoFactorTempLimiter`                    | inherits `LOGIN_*` | Keys on the **SHA-256 hash** of the token-derived user id                                                        |

### Streaming and response

`setHeaders` opens the SSE stream. `X-Accel-Buffering: no` and
`Cache-Control: no-transform` are the load-bearing headers — without them nginx and
most CDNs buffer the response and the client receives the whole generation at once.

**Because `setHeaders` writes the head immediately, every failure after it must be
reported through the event stream** (`middleware/error.js`), not as an HTTP status.
This is why `denyRequest` saves the user's message and emits the error as an
assistant reply: a bare HTTP error would lose the user's text and leave a dangling
stream.

---

## 10. The chat pipeline

The most intricate part of the backend. `POST /api/agents/chat` does not return a
response — it registers a **resumable generation job** and streams into it.

### Route mount order is the security model

`server/routes/agents/index.js`, in order:

```
1. /v1/responses  → responses.js   ← API-key auth INSIDE the route file
2. /v1            → openai.js      ← must come after /v1/responses
3. requireJwtAuth → checkBan → uaParser        (everything below)
4. GET  /chat/stream/:streamId     ← reattach + replay
   GET  /chat/active
   GET  /chat/status/:conversationId
   POST /chat/abort                ← mounted BEFORE the limiters
5. POST /chat/steer | /steer/cancel | /steer/arm
6. /                → v1.js        (agent CRUD)
7. /chat            → chatRouter → chat.js  (config + optional limiters)
```

Two deliberate placements:

- The **OpenAI-compatible and Open Responses surfaces mount first**, before the JWT
  gate, because they authenticate by API key. `/v1/responses` must precede `/v1` or
  the less specific mount swallows it.
- The **generation-control endpoints mount before the rate limiters**. They must stay
  responsive exactly when a user is hitting limits or reconnecting.

### The chat middleware chain

`server/routes/agents/chat.js` — each layer assumes the previous one ran:

| #   | Middleware                 | Why in this position                                                                         |
| --- | -------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `restoreResumeContext`     | A HITL resume body lacks the full original request                                           |
| 2   | `createMessageFilterPii`   | **First** among content checks — sensitive text must never reach the external moderation API |
| 3   | `moderateText`             | Optional OpenAI moderation                                                                   |
| 4   | `checkAgentAccess`         | Role permission to use agents at all                                                         |
| 5   | `checkAgentResourceAccess` | ACL on the specific agent, read from the **body**                                            |
| 6   | `validateConvoAccess`      | Conversation ownership                                                                       |
| 7   | `buildEndpointOption`      | Normalizes into `endpointOption`; applies model specs                                        |

The same order is reproduced for `/chat/steer`, because a steer is new model-bound
user text. `/steer/cancel` and `/steer/arm` skip PII and moderation — they add no
content.

### Resumable generations

```
POST /api/agents/chat
   │
   ├─ register job with GenerationJobManager (streamId)
   ├─ stream SSE to the client
   │
   │   client disconnects ✂
   │
   └─ GET /api/agents/chat/stream/:streamId?resume=true
         ├─ sync event with resume state
         ├─ replay missed chunks
         └─ continue live
```

**Generation protocol negotiation** (`controllers/agents/protocol.js`) — the rule is
**lowest wins**. `getRequestedGenerationProtocol` reads the marker from every
transport that can carry it and takes the _minimum_, because a proxy or
token-refresh path that drops one marker must never accidentally _upgrade_ a legacy
request. The agreed version travels in both a header and **inside every JSON
envelope** — the body is the client's fail-closed source of truth, because
auth-refresh adapters can strip headers. Negotiation happens _before_ a job is read,
so validation/not-found/authorization envelopes never leak whether a job exists to
an unauthorized caller.

### Human-in-the-loop (HITL)

A run can pause for tool approval or an ask-user question, then resume:

```
run → handleRunInterrupt → LangGraph checkpoint → (pause)
                                                    │
POST /api/agents/chat/resume ───────────────────────┘
   ├─ findUndecidedToolCalls / findIncompleteDecisions / findDisallowedDecisions
   │     ← decisions must cover exactly the pending calls and nothing else,
   │       so a crafted body cannot approve a tool the model never requested
   ├─ isPendingActionStale + computeAgentRequestFingerprint
   │     ← if the agent/model/request shape changed, fail rather than silently
   │       running under different parameters
   └─ resumeCompletion → may pause again (persistRePauseProgress)
```

Checkpoints are deleted on every terminal path so a failed resume cannot be replayed.

### Key files

| File                                      | Lines | Role                                                   |
| ----------------------------------------- | ----- | ------------------------------------------------------ |
| `controllers/agents/client.js`            | ~3.8k | `AgentClient extends BaseClient` — the run itself      |
| `controllers/agents/request.js`           | ~1.9k | `ResumableAgentController` — starts and streams a turn |
| `controllers/agents/callbacks.js`         | ~1.4k | Graph events → SSE events, files, usage                |
| `controllers/agents/resume.js`            | ~1.1k | HITL resume                                            |
| `controllers/agents/v1.js`                | ~1.6k | Agent CRUD + reference authorization                   |
| `services/Endpoints/agents/initialize.js` | ~1.1k | Builds the `AgentClient`                               |
| `app/clients/BaseClient.js`               | ~1.6k | History, context window, persistence, billing          |

Two patterns to know before editing `client.js`:

- **Sinks.** `contextUsageSink`, `usageEmitSink`, `collectedUsage`, `stepMap`,
  `toolInputValidationErrors` are mutable collectors passed _in_ by the caller.
  Streaming handlers fire asynchronously and out of order, and the caller needs the
  accumulated state at **abort or error** time, not only on clean completion.
- **Generation stamping.** Every stream write is guarded by
  `isStreamWritable(res, streamId)` and carries an `expectedCreatedAt`. A client can
  reconnect to a _new_ generation on the same conversation while a stale handler is
  still firing; without the stamp, late events from an old run would be written into
  the new stream.

### Memory hygiene

`server/cleanup.js` exists because a streaming request builds a large object graph
riddled with circular references (client ↔ options, graph ↔ runnable). Under
sustained load V8 keeps them alive far past the request and RSS climbs until
OOM-kill. `disposeClient` plus the explicit `graphPropsToClean` /
`graphRunnablePropsToClean` allow-lists break the cycles. They are allow-lists, not a
recursive walk — a blind deep-null would corrupt shared singletons that legitimately
outlive the request. `clientRegistry` (a `FinalizationRegistry`) is diagnostic only:
it logs when a client is actually collected, which is how leaks get confirmed.

---

## 11. Subsystems

### Configuration — layered and cached

```
librechat.yaml (local file or remote URL)
        │  validated against configSchema
        ▼
  base config layer  ────────────┐
                                 │  createAppConfigService (packages/api)
  per-principal overrides  ──────┤    role / group / user / tenant
  (admin/config routes)          │
                                 ▼
             getAppConfig({ role, userId, tenantId })
                                 │
                                 ▼
                    req.config   (via configMiddleware)
```

Overrides support **field-level** patch, delete and **tombstone** operations.
A tombstone is distinct from a delete: it explicitly suppresses a value inherited
from a lower layer, which deleting the override cannot express.

`invalidateConfigCaches(tenantId)` flushes the app-config cache, the tool cache and
the MCP config cache **together** — they derive from the same source, so flushing
one would leave a self-inconsistent view. Every admin config write calls it.

### Cache — one registry

Every cache in the backend is reached through `cache/getLogStores.js`, so the backing
store and TTL for each namespace live in exactly one table. Store _kind_ is chosen
per namespace by intent:

| Kind             | Used for                      | Why                               |
| ---------------- | ----------------------------- | --------------------------------- |
| `violationCache` | Abuse counters                |                                   |
| `sessionCache`   | OpenID/SAML session material  |                                   |
| `standardCache`  | Derived/computed data         |                                   |
| `keyvMongo`      | Bans, encoded domains         | **Must survive a Redis flush**    |
| `disabledCache`  | User principals when TTL is 0 | No-op so callers never null-check |

### Files — pluggable storage

`services/Files/strategies.js` is the single indirection that makes storage
swappable. **No caller anywhere imports `Local/crud.js` or `Azure/crud.js`
directly** — they ask for a strategy:

```js
const { processAvatar } = getStrategyFunctions(fileStrategy);
```

Backends: `local`, `s3`, `cloudfront`, `azure`, `firebase`. Non-storage "sources"
share the same shape so the pipeline needs no branching for them: `vector` (RAG),
`openai` (files hosted upstream), `code_output` (sandbox artifacts), and the
OCR/document-parser strategies.

Because the strategy is chosen from **the file's own `source`**, a file stored under
one backend stays readable after the default changes. This is also why
`getDeleteMethod` resolves the deleter from the file rather than current config, and
why `createDeleteFileWithSecondaryStorage` exists for files that live in two places
(object storage _and_ the vector DB).

Upload path guards worth knowing: filenames are `crypto`-randomized on disk and never
used as path components; `determineFileType` sniffs the real type from the buffer
rather than trusting the declared MIME type; `isValidPath` is the traversal boundary
for local storage; and image encoding is size- and format-guarded
(`runGuardedEncode`) because images arrive from user uploads _and_ model output.

### Tools, MCP and Actions

Three different mechanisms produce callable tools:

| Source             | Defined by                                         | Credentials                                 |
| ------------------ | -------------------------------------------------- | ------------------------------------------- |
| **Manifest tools** | `app/clients/tools/structured/*` + `manifest.json` | Per-user plugin auth, resolved at call time |
| **Actions**        | Users, as OpenAPI specs                            | Encrypted metadata; SSRF-safe HTTP agents   |
| **MCP tools**      | MCP servers (operator or user defined)             | OAuth / OBO / stored tokens                 |

`services/ToolService.js` unifies them, and splits **definition loading** from
**execution loading** — the model only needs schemas to decide what to call, and
instantiating every executable (each of which may resolve credentials or open a
connection) for tools that are never invoked is wasted work on every turn.

MCP specifics worth internalizing:

- **Name resolution is a whole subsystem.** Tool keys are namespaced `server:tool`;
  server names are normalized and aliased. `healMcpToolNames` repairs stored
  agent/assistant tool references after a server rename — without it a rename would
  silently break every agent using it.
- **`createUnavailableToolStub`** keeps a down or unauthorized server's tool present
  as a stub that reports unavailability. Omitting it would change the model's tool
  set mid-conversation and invalidate the cached prompt.
- **OAuth happens mid-generation.** Run-step events let the UI show an "authorize"
  button inside the streaming response while the run waits, rather than failing the
  turn.
- **Tool catalogs are generation-versioned.** Multiple replicas may discover changes
  concurrently; compare-and-set publication stops a slower replica from overwriting a
  newer catalog with a stale one.

### Data layer

```
models/index.js
   └─ createMethods(mongoose, { matchModelName, findMatchingPattern,
                                isExternalSkillId, getCache })
          │
          └─ every DB method, defined in packages/data-schemas
```

Model _methods_ live in `packages/data-schemas` (shareable across backend projects);
`models/index.js` is the thin JS binding that injects runtime dependencies. That
inversion is why `packages/data-schemas` stays free of app-level imports.

`db/index.js` registers models and exposes `connectDb` + `indexSync`.
`db/indexSync.js` keeps MeiliSearch consistent with MongoDB — coordinated through
`FlowStateManager` so replicas do not run overlapping syncs, and gated by two
independent kill switches (`SEARCH`, `MEILI_NO_SYNC`).

**Backend DB performance guidance** (from `CLAUDE.md`, and visible throughout):
watch for serial reads on request-startup and first-page-load paths; pass
already-loaded user/role/config data through helpers instead of re-reading it; start
independent reads in parallel but **gate the response on the authorization result**
before returning data. `ModelController` is the canonical example —
`loadDefaultModels` and `loadConfigModels` run in `Promise.all`.

---

## 12. Cross-cutting concerns

### Multi-tenancy

Tenant context is async-local storage, established by `requestContextMiddleware` and
`tenantContextMiddleware`. Three helpers appear throughout:

| Helper                             | Use                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| `getTenantId()`                    | Read the current tenant                                                                    |
| `runAsSystem(fn)`                  | Cross-tenant operations (boot seeding, sweeps, share reads)                                |
| `restoreTenantContextFromReq(req)` | Re-establish context after multer or on async continuations that outlive the request scope |

`TENANT_ISOLATION_STRICT` rejects unscoped queries. The reverse proxy **must** strip
or set `X-Tenant-Id` — untrusted clients must not be able to set it directly, and
`server/index.js` logs a warning to that effect at boot.

Shared links read under the **link's** tenant scope, not the viewer's — the viewer
may have none.

### Error handling — two paths

| Situation                         | Path                                | Result                                           |
| --------------------------------- | ----------------------------------- | ------------------------------------------------ |
| Ordinary HTTP route               | `ErrorController` (mounted last)    | JSON error response                              |
| Chat / SSE (headers already sent) | `middleware/error.js` → `sendError` | Error **saved as a message** and pushed over SSE |

Chat errors must arrive _in the conversation_: by the time a generation fails, the
headers are already `text/event-stream`. Saving the error as a message also keeps the
message tree consistent — a user message with no reply would corrupt the parent
chain.

`isAbortError` walks the error `cause` chain with a `visited` set (chains can be
circular). Abort signals arrive wrapped by fetch/undici/provider SDKs, and a
top-level-only check misclassifies user aborts as server errors.

### Billing

Balance is checked **before** the provider call (`checkBalance` in `BaseClient`).
Usage is recorded on **every** terminal path, including abort and error —
`spendCollectedUsage` charges what the provider actually consumed, because silently
discarding it would let abuse avoid all billing. Usage is aggregated across primary,
summarization, sequential and subagent calls.

### Telemetry

`server/telemetry.js` branches at _require_ time and exports two shape-compatible
objects, so callers never guard and the heavy OTel subtree is never loaded when
disabled. Enabling requires `OTEL_TRACING_ENABLED=true` **and** `OTEL_SDK_DISABLED`
not truthy, so the standard OTel kill switch works without touching app config.

---

## 13. Load-order traps and gotchas

Hard-won, easy to reintroduce. Each is guarded by a comment at the site.

| Trap                                                                      | Consequence                                                                                  |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `config/credentials` not required first                                   | Modules that read `process.env` at import time see nothing                                   |
| `telemetry` required after `express`/`mongoose`                           | Instrumentation cannot patch them; spans go missing                                          |
| `createModels()` after `require('./indexSync')`                           | `indexSync` captures undefined models; **every Meili sync silently fails on every boot**     |
| Removing the `req.query` writability shim                                 | `express-mongo-sanitize` silently stops sanitizing                                           |
| `capabilityContextMiddleware` mounted after a route using `hasCapability` | Capability resolution re-reads principals and grants on every check                          |
| `ErrorController` not last                                                | Express will not recognize it (4-arg signature)                                              |
| Importing capability helpers from the middleware barrel                   | Circular require returns `{}` — **no error**                                                 |
| `/v1` mounted before `/v1/responses`                                      | The less specific mount swallows the Open Responses API                                      |
| SPA fallback serving `index.html` for a missing asset                     | Poisoned browser/service-worker caches; app stays broken after redeploy                      |
| Editing `app/clients/prompts/summaryPrompts.js` without re-measuring      | The template's token count (98/101, documented inline) is charged against the summary budget |

Also worth knowing:

- **`server/experimental.js` is a deliberate copy** of `server/index.js` (clustered
  variant). The boot order is delicate, and a shared factory would couple the stable
  path to changes made while experimenting. Fixes must be mirrored;
  `server/index.js` is authoritative if they diverge.
- **`services/Endpoints/assistants/initalize.js`** — the filename typo is
  load-bearing; it is the import path in use.
- **`server/utils/files.js` uses a dynamic `import()`** for `file-type`, which is
  ESM-only. One of the few places the project's no-dynamic-imports rule is
  unavoidable.

---

## 14. Testing

Framework: **Jest**, run per-workspace.

```bash
cd api && npx jest <pattern>
```

### Philosophy

- **Real logic over mocks.** Exercise actual code paths with real dependencies.
  Mocking is a last resort.
- **Spies over mocks.** Assert that real functions were called with expected
  arguments, without replacing the underlying logic.
- **MongoDB:** use `mongodb-memory-server` for a real in-memory instance. Test real
  queries and schema validation, not mocked DB calls. (This is why the default test
  timeout is 30s.)
- **MCP:** use real `@modelcontextprotocol/sdk` exports for servers, transports and
  tool definitions. Mirror real scenarios; do not stub SDK internals.
- Only mock what you cannot control: external HTTP APIs, rate-limited services,
  non-deterministic system calls.
- Heavy mocking is a code smell, not a testing strategy.

### Conventions

| Location                                    | Contains                                                   |
| ------------------------------------------- | ---------------------------------------------------------- |
| `*.spec.js` / `*.test.js` beside the source | Unit and integration tests                                 |
| `__tests__/`                                | Grouped suites (agents e2e, HITL checkpoints, route tests) |
| `__test-utils__/`                           | Shared fixtures — **not** collected as tests               |
| `app/clients/specs/FakeClient.js`           | `BaseClient` test double: exercises the real base class    |
| `test/__mocks__/`                           | `openid-client` fakes (ESM-only + network discovery)       |

---

## 15. Commands and environment

| Command                       | Purpose                                                  |
| ----------------------------- | -------------------------------------------------------- |
| `npm run backend`             | Start the backend                                        |
| `npm run backend:dev`         | Start with file watching                                 |
| `npm run frontend:dev`        | Frontend dev server (port 3090; needs backend running)   |
| `npm run build`               | Build all compiled code via Turborepo (parallel, cached) |
| `npm run build:data-provider` | Rebuild `packages/data-provider` after changes           |
| `npm run smart-reinstall`     | Install deps if the lockfile changed, then build         |
| `npm run reinstall`           | Clean install from scratch                               |

- Node.js **v24.16.0**; MongoDB.
- Backend `http://localhost:3080/`, frontend dev server `http://localhost:3090/`.
- Operator configuration lives in `librechat.yaml` (gitignored in this checkout —
  restart the backend after editing it).

### Frequently relevant environment variables

| Area    | Variables                                                                                                                                 |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Core    | `PORT`, `HOST`, `TRUST_PROXY`, `MONGO_URI`, `DOMAIN_CLIENT`, `DOMAIN_SERVER`                                                              |
| Crypto  | `CREDS_KEY`, `CREDS_IV`, `JWT_SECRET`, `JWT_REFRESH_SECRET`                                                                               |
| Auth    | `ALLOW_REGISTRATION`, `ALLOW_SOCIAL_LOGIN`, `ALLOW_SOCIAL_REGISTRATION`, `ALLOW_PASSWORD_RESET`, `ALLOW_EMAIL_LOGIN`                      |
| OpenID  | `OPENID_CLIENT_ID`, `OPENID_ISSUER`, `OPENID_SCOPE`, `OPENID_SESSION_SECRET`, `OPENID_REUSE_TOKENS`, `OPENID_AUDIENCE`, `OPENID_USE_PKCE` |
| Abuse   | `BAN_VIOLATIONS`, `BAN_INTERVAL`, `BAN_DURATION`, `LIMIT_MESSAGE_IP`, `LIMIT_MESSAGE_USER`, `LIMIT_CONCURRENT_MESSAGES`                   |
| Search  | `SEARCH`, `MEILI_HOST`, `MEILI_MASTER_KEY`, `MEILI_NO_SYNC`, `MEILI_SYNC_THRESHOLD`                                                       |
| Ops     | `OTEL_TRACING_ENABLED`, `METRICS_SECRET`, `MEM_DIAG`, `CONTINUE_ON_UNCAUGHT_EXCEPTION`, `DISABLE_COMPRESSION`, `NO_INDEX`                 |
| Tenancy | `TENANT_ISOLATION_STRICT`                                                                                                                 |

---

## Where to start reading

1. **`server/index.js`** — the boot sequence and middleware order _are_ the
   architecture.
2. **`server/routes/agents/index.js`** then **`chat.js`** — mount order and
   middleware chain as security model.
3. **`server/middleware/accessResources/canAccessResource.js`** — the ACL factory
   every resource specialization is built on.
4. **`server/services/Files/strategies.js`** — the indirection pattern this codebase
   uses for pluggability.
5. **`server/controllers/agents/client.js`** — the deep end. Read the header first.
