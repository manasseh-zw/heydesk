# AGENTS.md

## Project context

Heydesk is a local-first AI workspace for turning everyday work context into
organized, editable, durable results. The product loop is intentionally
focused:

1. The user provides workspace context or selects an existing artifact.
2. The user asks Heydesk to do useful work.
3. Codex interprets the request and proposes or performs a bounded action.
4. The local server validates and applies the action.
5. The UI shows progress and leaves behind an editable result.

This repository is the main Heydesk implementation. Build the central user
journeys completely before expanding into speculative platform layers.

## Repository shape

This is a Better-T-Stack monorepo using pnpm, Turborepo, TanStack Router,
React, Hono, Node.js, SQLite, and Drizzle:

```text
heydesk/
  apps/
    web/                 React and TanStack Router application
    server/              Hono application and privileged local boundary
  packages/
    ui/                  shared shadcn/ui primitives and theme tokens
    db/                  SQLite connection, Drizzle schema, and migrations
    env/                 validated runtime environment configuration
    config/              shared TypeScript configuration
  docs/                  product context, decisions, and submission material
```

The root package owns workspace scripts and Turborepo orchestration. Keep
`apps/web` and `apps/server` independently runnable while making the normal
development journey available from the root.

## Domain-first vertical slices

Organize behavior by customer-facing domain, especially on the server. Do not
create a generic `services/`, `controllers/`, or `utils/` folder that becomes
the home for unrelated behavior.

Start at the route and follow one complete slice to its durable boundary:

```text
TanStack route
  -> domain page/components
  -> client domain operation
  -> Hono domain route
  -> domain service
  -> repository or integration adapter
  -> SQLite, filesystem, or Codex
```

When a domain needs more than one server module, use a domain folder:

```text
apps/server/src/
  app.ts                         Hono composition only
  index.ts                       process startup only
  domains/
    workspace/
      workspace.routes.ts        HTTP and SSE wiring
      workspace.service.ts       domain use cases
      workspace.repository.ts    persistence queries
      workspace.schemas.ts       request validation
      workspace.types.ts         server-side contracts
      workspace.events.ts        domain event mapping, when needed
    assistant/
      assistant.routes.ts
      assistant.service.ts
      assistant.schemas.ts
      assistant.types.ts
  infrastructure/
    codex/                       app-server transport and adapter
    filesystem/                  safe local file operations
```

Do not create every file or folder in advance. A small domain can begin as one
module beside `app.ts`; introduce the folder when a second responsibility or
consumer appears. Keep the domain name in every filename so a feature can be
followed across the repository.

On the client, keep TanStack route files thin and place the visible feature in
the matching domain folder:

```text
apps/web/src/
  routes/
    index.tsx                    route composition and URL state
    setup.tsx
  features/
    workspace/
      components/                workspace-specific presentation
      hooks/                     feature lifecycle and interaction state
      workspace.service.ts       browser calls to the local server
      workspace.queries.ts       TanStack Query definitions
      workspace.types.ts         stable client models
    assistant/
      components/
      hooks/
      assistant.service.ts
      assistant.types.ts
  components/                   truly shared application components only
  components/ui/                 shared shadcn primitives when app-owned
```

A route composes a feature; it should not contain persistence, Codex protocol,
Markdown/MDX parsing, or large business rules. A feature component renders the
customer experience; it should call a domain operation rather than `fetch`
directly when the operation has meaningful behavior.

## Boundary rules

- The browser never accesses the filesystem, SQLite, child processes, or Codex
  directly.
- `apps/server/src/app.ts` owns Hono registration and HTTP concerns. Domain
  routes validate input, call a domain service, and map the result to a stable
  response.
- Hono is the API boundary. Do not add tRPC or oRPC unless a concrete product
  requirement justifies the extra layer. Use ordinary typed JSON routes and
  SSE for streaming events.
- Validate every untrusted request with Zod or a similarly explicit schema.
  Use `unknown` at external boundaries and narrow it with named helpers.
- Keep persistence and integration adapters behind domain services. React must
  not know whether a result came from SQLite, a Markdown/MDX file, or Codex.
- Separate assistant text, temporary streamed drafts, requested actions,
  validated mutations, durable state, and activity events. Never write every
  streamed token directly to durable storage.
- Codex actions must use bounded, typed commands. Validate target scope and
  permissions before committing a mutation, and make failures recoverable.

## Persistence and state

SQLite is the durable structured-state layer. Drizzle owns schema and query
construction; the Hono server is the writer boundary. TanStack Query owns
browser server-state caching and invalidation, not the database itself.

Portable page and document content should remain readable outside Heydesk.
Use Markdown or MDX for human-readable source and SQLite for structured
records, properties, relationships, and metadata. MDX is a presentation and
composition format, not permission to execute untrusted code without an
explicit trust policy.

## Codex integration

Treat Codex as an accountable operator, not a generic text endpoint. A domain
integration should make the following visible in code and, where useful, in
the UI:

1. the context supplied to Codex;
2. the requested action or response contract;
3. validation before a workspace mutation;
4. streamed activity and temporary drafts;
5. the durable commit point;
6. errors, cancellation, and recovery.

Keep the long-lived app-server transport in infrastructure. Domain services
own thread, turn, approval, and action behavior. Do not leak raw JSON-RPC
payloads into React components.

## UI and visual language

- Use shadcn/ui primitives from `packages/ui` for controls and layout.
- Keep the Heydesk visual language calm, spacious, and lime-led. Prefer the
  established design tokens over one-off colors in feature components.
- Use Lucide icons consistently and provide accessible labels and keyboard
  behavior.
- Every async surface needs explicit loading, empty, error, success, and
  recovery states.
- Keep customer-facing language free of internal terms such as engine,
  workflow runner, transport, or RPC unless the user is inspecting setup or
  diagnostics.

## TypeScript and naming

- Use `type` for application contracts and literal unions; use `interface`
  only for declaration merging or external augmentation.
- Use `import type` for type-only imports and avoid `any`.
- Use kebab-case filenames, PascalCase React components, and camelCase
  variables and functions.
- Prefer named exports. Framework-required default exports are acceptable.
- Keep public client models in the owning feature and shared packages only
  when there is a real second consumer.
- Keep comments short and explain product decisions or integration quirks,
  not obvious syntax.
- Follow the formatting style already established by the generated project;
  format changed files before handoff.

## Development workflow

For each feature:

1. Write down the one user journey and durable result.
2. Build the smallest complete vertical slice.
3. Keep the real integration seam visible; use a narrow fixture only when an
   external dependency is genuinely unavailable.
4. Test the happy path and the main failure or recovery path.
5. Extract shared abstractions only after a second real consumer exists.

Before handoff, run the relevant root checks:

```bash
pnpm run build
pnpm run check-types
```

When changing a browser/server boundary, exercise the actual user journey as
well as unit tests. Update the relevant document in `docs/` when a product or
architecture decision changes.

## Branches, commits, and pull requests

Use two long-lived branches:

- `main` is the stable branch used for release candidates and future packaged
  builds.
- `develop` is the active integration branch for the hackathon implementation.

Create short-lived feature or fix branches from `develop` and target pull
requests back to `develop`. Merge `develop` into `main` only at a deliberate
release milestone.

Keep the history readable. After each coherent feature, domain slice, fix,
refactor, or documentation milestone, Codex should either make the commit
when the user has authorized it or pause and ask whether the work is ready to
commit. Do not wait until the entire product is complete to create one large
commit. Do not commit half-implemented work merely to create activity.

Use Conventional Commit-style messages:

```text
feat(workspace): add page creation flow
fix(assistant): recover after app-server exit
refactor(db): move table queries into the workspace domain
docs(architecture): record the local persistence decision
test(assistant): cover approval correlation
chore(repo): update development tooling
```

Use a present-tense imperative summary, keep the first line concise, and add
an explanatory body only when the reason or migration detail is valuable. Pull
requests should explain the user journey, the durable result, validation run,
and any remaining risks. The repository template in `.github/` is the minimum
PR structure.

Git identity must stay scoped to the actor making the commit. Keep the local
and global Git identity set to the human maintainer. When Codex creates a
commit, it must apply the identity only to that command with inline `-c`
options:

```bash
git -c user.name="Codex" -c user.email="noreply@openai.com" commit -m "..."
```

The current ChatGPT-bundled Codex runtime uses `Codex <noreply@openai.com>`
for its built-in attribution. Do not change the repository's persistent
`user.name` or `user.email` to Codex, and do not run `git config user.name` or
`git config user.email` as part of a Codex commit workflow. If a future Codex
runtime exposes a different built-in attribution address, use that runtime's
documented address instead of guessing one.

This separates commit metadata, which GitHub reads from the commit author and
email, from push authentication. A local Codex session still pushes through
the user's configured GitHub credentials, so it cannot make a local push or
pull request appear to have been authenticated by the Codex GitHub account.
The GitHub-hosted Codex integration is a separate actor and requires its own
repository access and connected account. Do not invent or use a personal
email as Codex's attribution address.

The hackathon requires the `/feedback` Codex Session ID from the primary
thread where most core functionality was built. Run `/feedback` in that
primary Codex thread near submission, copy the generated ID, and record it in
the submission material. It is a Codex command, not a repository script.

## Change discipline

- Preserve unrelated work in the shared repository.
- Read the route, feature, client operation, server route, domain service,
  persistence boundary, and tests before changing an established pattern.
- Keep claims in the UI and documentation honest about what is implemented.
- Prefer a simple explicit implementation over speculative abstractions.
- Do not add Electron, Tauri, collaboration, sync, advanced table behavior,
  or broad automation until the core Heydesk loop is reliable.

<!-- opensrc:start -->

## Source Code Reference

Source code for dependencies is available in `opensrc/` for deeper understanding of implementation details.

See `opensrc/sources.json` for the list of available packages and their versions.

Use this source code when you need to understand how a package works internally, not just its types/interface.

### Fetching Additional Source Code

To fetch source code for a package or repository you need to understand, run:

```bash
npx opensrc <package>           # npm package (e.g., npx opensrc zod)
npx opensrc pypi:<package>      # Python package (e.g., npx opensrc pypi:requests)
npx opensrc crates:<package>    # Rust crate (e.g., npx opensrc crates:serde)
npx opensrc <owner>/<repo>      # GitHub repo (e.g., npx opensrc vercel/ai)
```

<!-- opensrc:end -->