# Heydesk architecture decisions and iteration record

This document records the reasoning behind the Heydesk proving ground. It is
intentionally more detailed than a setup guide: the engineering process is
part of the project. Heydesk was built as a fast end-to-end experiment before the
final submission repository, so some decisions optimize for learning and
integration feedback rather than final product completeness.

## The thesis

Heydesk is a local-first workspace where a user can provide context, ask an AI
operator to do useful work, observe the work, and receive an editable durable
result. The important technical claim is not that Heydesk can display a chat
response. It is that Codex can participate in a bounded local workflow:

```text
user intent
    -> Codex app-server session
    -> visible activity and proposed mutation
    -> server validation and approval policy
    -> local Markdown or structured data
    -> reactive client update
```

The proving ground exists to validate that loop and expose integration errors
before building the polished submission application.

## Constraints that shaped the work

- The demo needed to run locally on a developer machine.
- Workspace content needed to remain inspectable and portable.
- Codex had to be a meaningful operator, not a decorative chat layer.
- The browser could not receive filesystem or child-process privileges.
- The first journey had to be reproducible in minutes.
- The implementation needed to preserve a credible path toward structured
  records and document generation without building those surfaces prematurely.

The resulting strategy was deliberately speed-of-light: build the smallest
complete vertical slice, test it against the real integration, record what
breaks, and only then extract abstractions.

## Development approach

### Why a proving ground came first

The original product direction included Electron, RxDB, SQLite, tables,
properties, document generation, voice, and a large Notion-inspired workspace.
Implementing those layers in that order would have hidden the riskiest
unknown: whether the local server could maintain a useful Codex app-server
session and safely apply changes to the workspace.

The first slice therefore reduced the product to:

1. connect or authenticate Codex;
2. open one workspace;
3. create a Markdown page;
4. ask Heydesk to modify it;
5. show the activity and result;
6. reload the durable file.

That slice found several protocol and version problems early. It also gave us
a working base from which to test structured data without confusing product
bugs with infrastructure bugs.

### Vertical slices instead of technology-first layers

Features are organized by the user-facing concept and followed end to end:

```text
route
  -> page component
  -> client service
  -> Hono route
  -> domain service
  -> filesystem, SQLite, or Codex
```

This is why workspace code is split by responsibility rather than putting all
browser calls in one generic API module or all server behavior in one route.
The structure makes it possible to replace a storage adapter without making
React understand persistence details.

## Decision records

### ADR-001 — Use a local Node/Hono boundary

**Decision:** The browser talks to a local Hono server. Node owns the
filesystem, Codex child process, persistence, validation, and event fan-out.

**Why:** A browser should not access workspace files or spawn Codex. Hono gives
the desktop-boundary design an explicit HTTP and SSE contract now, while
leaving Electron as a future host rather than a prerequisite for proving the
product loop.

**Rejected for the proving ground:** Direct browser filesystem access,
Electron-first implementation, and a remote Heydesk API. Each would add packaging
or security concerns before the core workflow was proven.

### ADR-002 — Use the Codex app-server, not the TypeScript SDK

**Decision:** Heydesk owns one long-lived `codex app-server --listen stdio://`
process and communicates with it over newline-delimited JSON-RPC.

**Why:** The UI needs persistent threads, streamed notifications, server-
initiated approval requests, login, turns, and interruption. The TypeScript
Codex SDK wraps `codex exec`, which is useful for isolated automation but does
not provide the same persistent bidirectional UI session model.

**Implementation:** The adapter frames split stdout chunks, correlates
request IDs, dispatches notifications separately from server requests,
initializes once, and rejects pending requests when the process exits.

References: [Codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md), [Codex TypeScript SDK](https://github.com/openai/codex/blob/main/sdk/typescript/README.md).

### ADR-003 — Prefer the ChatGPT-bundled Codex binary, with an explicit override

**Decision:** Resolve `CODEX_BIN` first. Otherwise prefer the Codex executable
bundled with the ChatGPT desktop app on macOS, then fall back to `codex` on
`PATH`.

**Why:** The target user is more likely to have the ChatGPT application than a
separately installed CLI. The app and CLI expose related app-server behavior,
but they are independently versioned installations. Updating the standalone
CLI does not update the binary bundled inside ChatGPT.

**Product implication:** The setup surface distinguishes “Codex is missing,”
“Codex is unauthenticated,” and “the connected binary needs an update.”

### ADR-004 — Treat the app-server model catalog as the compatibility authority

**Decision:** Read the effective configured model and the app-server's model
catalog. If the configured model is not available, return an explicit
`update_required` state instead of silently selecting another model.

**Why:** Model names and app-server capabilities can change independently from
the ChatGPT application UI. A model selector based on a hardcoded local
`models.json` would become stale and would not explain why a turn failed.

The client receives visible models from the server and sends the selected
model back as an explicit turn override. Compatibility is permissive when the
requested model is supported and strict when the configured model cannot be
resolved.

### ADR-005 — Start with text turns; defer realtime voice

**Decision:** Voice input was prototyped and then removed from the MVP.

**What failed:** Different app-server versions rejected realtime request
variants, required an `experimentalApi` capability, or reported that a
thread did not support realtime conversation. These were not ordinary UI bugs;
they exposed an unstable protocol and capability negotiation surface.

**Why defer it:** The text path already proved the valuable workflow. Shipping
voice would have made the demo dependent on experimental capabilities and
created a misleading promise. The experiment was still useful because it
revealed that version and capability checks must be first-class integration
concerns.

### ADR-006 — Make ordinary edits automatic, but preserve destructive review

**Decision:** Non-destructive changes to the selected page are automatically
accepted. Deletes, moves, unrelated paths, and shell commands remain blocked
or require explicit approval.

**Why:** Asking for approval before every small content edit makes the product
feel unusable. Removing all review would make the local operator unsafe. The
policy is therefore bounded by both the selected page and the action type.

Heydesk starts turns with Codex's `untrusted` approval policy so file changes are
always routed through the app-server approval request. The server auto-accepts
safe changes to the selected page and keeps destructive changes pending for
the user. This is stronger than relying on `workspaceWrite` plus a prompt:
that mode can allow an explicitly requested delete without emitting a review
request on some Codex releases.

This also keeps the user-facing assistant language focused on the result. It
does not expose internal paths unless the user asks for implementation detail.

### ADR-007 — Keep Markdown as the first durable content format

**Decision:** Human-readable pages are stored as Markdown files with a stable
page ID and a first-level title heading.

**Why:** Markdown is portable, easy for Codex to edit, easy to inspect during a
demo, and useful outside Heydesk. The server performs atomic writes and uses
`expectedUpdatedAt` to detect conflicting edits.

**Deferred:** Rich document export, attachments, embeds, and a full
block-document model.

### ADR-008 — Explore RxDB conceptually, but first implement the smallest DexStore

**Historical decision:** Before the structured page journey was proven, do not
add RxDB or SQLite. Build a small server-owned JSON store inspired by the
useful lowdb adapter boundary.

**Why:** RxDB is a strong future logical document model, but adding its
replication, storage, packaging, and schema decisions before a structured page
journey existed would increase the number of unknowns. SQLite would solve
durability, not the product-level command and event contract.

The experimental `DexStore` provided:

- `read`/`write` adapters;
- atomic JSON-file persistence;
- typed collections and validators;
- document revisions and timestamps;
- serialized writes;
- simple queries;
- event-driven query subscriptions.

This was intentionally not a claim that DexStore replaced RxDB. It was a
learning implementation that made the persistence boundary explicit. The
prototype has now completed that experiment and the JSON store is no longer a
runtime dependency.

Reference: [lowdb](https://github.com/typicode/lowdb).

### ADR-009 — Keep table data behind a server contract

**Decision:** The client uses table routes and normalized `table.changed`
events. React never reads SQLite directly. The legacy JSON file is only an
input to the one-time migration path.

The current internal shape is a database envelope:

```text
  .heydesk/heydesk.sqlite
  dex_metadata
  table_definitions
  table_rows
```

**Why:** Direct browser access would break the browser/server boundary. Direct
Codex edits to the shared file would bypass validation and could mutate tables
other than the selected one.

The current table slice proves creation, row insertion, text editing, status
changes, persistence, reload, and event-driven refresh. It does not yet claim
to be a complete table editor.

### ADR-010 — Use MDX as presentation, not as the database

**Decision:** MDX is the page source and presentation layer, not the source of
truth for reactive table rows. The page is stored as `.mdx`; table definitions
and rows live in SQLite.

MDX is attractive because it combines Markdown and JSX and can render a
controlled component such as:

```mdx
# Leads

<DexTable tableId="leads" />
```

That would allow rich pages to compose tables, charts, callouts, and other
workspace primitives. However, MDX is compiled to JavaScript and is a
programming language. Dynamically compiling untrusted MDX would require a
careful trust and sandboxing policy.

The better long-term split is:

```text
  MDX / Markdown document = portable page source and presentation
  SQLite + Drizzle        = durable structured records and transactions
  TanStack Query          = client server-state cache and invalidation
  typed actions           = Codex-to-Heydesk command boundary
```

References: [MDX overview](https://mdxjs.com/docs/what-is-mdx/), [MDX integration and security](https://mdxjs.com/docs/getting-started/).

### ADR-012 — Replace the proving-ground JSON store with SQLite and Drizzle

**Decision:** Use a local SQLite file as the durable structured-state layer,
Drizzle as the typed repository query builder, and TanStack Query as the
client cache. Keep the local Hono server as the only writer boundary.

The database starts at `workspace/.heydesk/heydesk.sqlite`. On first startup, an
existing `.heydesk/data.json` is imported once so the experiment does not discard
the table data already created during the earlier proving phase. The JSON
store implementation and its tests are removed after that migration path is
in place.

This split gives us transactions and indexed queries without pretending that
TanStack Query is a database reactivity engine. External changes still arrive
through the server event stream; the client invalidates the affected query and
refetches the canonical snapshot.

### ADR-013 — Separate streamed drafts from committed MDX

**Decision:** A streamed Codex file diff is reconstructed as a temporary page
draft and applied to the same inline editor. It is never written to the durable
page until the Codex change has been accepted by the server.

Partial MDX can be syntactically incomplete while it is being generated. The
MVP therefore keeps streamed content transient and retries parsing on each
complete diff. The durable editor uses Tiptap's open-source Markdown extension
and a Heydesk-owned custom node schema. An AI cursor decoration makes the transient
write visible without confusing it with a committed save.

### ADR-014 — Use an inline Tiptap document with DexTable bindings

**Decision:** The page editor is one inline Tiptap surface. A structured table
is an atomic custom node serialized as `<DexTable tableId="…" />`, while its
columns and rows remain in SQLite. The editor does not expose a source/preview
toggle and does not include a generic Markdown pipe-table node.

**Why:** The source/preview experiment made the implementation technically
simple but produced the wrong product interaction: users were editing source
and looking at a separate rendering. Tiptap provides the editing transaction
model, keyboard behavior, marks, lists, code blocks, undo/redo, and a Markdown
serialization boundary. A custom React node view lets a table remain directly
editable in place while the server retains ownership of validation and
transactions.

Codex receives the bounded `dex_create_table` dynamic tool. The tool creates
the SQLite definition and initial rows, returns the generated binding, and
the prompt instructs Codex to insert that binding into the MDX page. As a
defensive compatibility layer, the server converts legacy pipe tables into the
same binding before both streamed drafts and committed page responses reach the
client.

References: [Tiptap Markdown](https://tiptap.dev/docs/editor/markdown),
[custom Markdown extensions](https://tiptap.dev/docs/editor/markdown/guides/integrate-markdown-in-your-extension),
[Codex app-server](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md).

### ADR-015 — Prefer portable tabular schema semantics

The current prototype uses Heydesk-specific column types such as `status`. For a
cleaner export path, a status field should eventually be represented as a
portable string with enum constraints, plus Heydesk-specific display metadata:

```json
{
  "name": "status",
  "type": "string",
  "constraints": { "enum": ["new", "warm", "won"] },
  "heydesk": { "display": "status" }
}
```

This keeps CSV and spreadsheet interoperability in view without pretending
that an export standard defines the entire UI. Frictionless Table Schema is a
useful reference for fields, types, constraints, and tabular interchange:
[Table Schema](https://specs.frictionlessdata.io/table-schema/).

## Challenges and what they taught us

### Protocol shape is part of the product

The first integration errors were not caused by React. They came from sending
the wrong sandbox representation, using an unsupported approval enum, and
calling realtime methods without the required capability or thread support.
The permanent lesson is to keep protocol adapters typed, log normalized
request/response boundaries, and expose recoverable compatibility states.

### “Streaming” has multiple meanings

Assistant text deltas and activity notifications can stream correctly even
when a file mutation becomes visible only after a turn completes. Durable
file state should not be confused with temporary assistant output. The UI can
show progress immediately while committing files and records at explicit
points.

### The easiest file to let Codex edit is not always the safest file

Markdown is naturally scoped to one page. A shared JSON store contains many
collections and pages, so allowing Codex to edit it directly would create a
large authority boundary. The next assistant/data integration should use a
page-scoped document or typed mutation actions, validate the proposed patch,
and then commit through the SQLite repository.

### A working prototype exposes missing product semantics

The table smoke test proved persistence, but it also exposed the next editor
requirements: add and remove columns, rename columns, manage status options,
delete rows, migrate schemas, and represent table pages in navigation. That
is valuable feedback; it is better to discover these gaps before claiming that
the table model is complete.

## Current implementation versus intended final architecture

### Proven in this workspace

- React/Vite client with TanStack Router.
- Hono/Node local server.
- Long-lived Codex app-server JSON-RPC adapter.
- ChatGPT OAuth and model catalog resolution.
- MDX page creation, inline editing, atomic writes, and conflicts.
- SSE activity and assistant events.
- Bounded file-change approval policy.
- SQLite + Drizzle structured persistence and inline table bindings.
- Tiptap Markdown serialization, transient streamed editor drafts, and an AI cursor.

### Intentionally deferred

- Electron packaging.
- RxDB production storage and replication.
- More allow-listed interactive MDX components.
- Table schema editing and migrations.
- Attachments and external integrations.
- Voice/realtime conversations.
- Document generation and export.
- Collaboration and multi-device sync.

## The next clean implementation

The final repository should hide storage behind explicit repositories and make
the assistant boundary action-oriented:

```text
DexTableRepository
  -> validates TableSchema
  -> commits a SQLite transaction
  -> emits table.changed

Codex action
  -> typed JSON Schema/Zod contract (the MVP's dex_create_table tool)
  -> server authorization and validation
  -> repository mutation
  -> visible event and result artifact
```

The proving ground has now answered the harder editor question too: an inline
document surface can stream a bounded Codex draft while keeping SQLite-backed
tables as real interactive bindings. The final repository can extend the
small allow-list of Heydesk components without returning to an opaque source and
preview split.

## Evidence to preserve for the hackathon write-up

- The original product and engineering context documents.
- The dated architecture decisions and this iteration record.
- Integration logs showing Codex process startup, model resolution, auth, and
  turn lifecycle.
- Tests for JSON-RPC framing, approval policy, persistence, and conflicts.
- The browser smoke test showing a table row surviving a reload.
- A clear distinction between implemented behavior and deferred direction.
- The Codex session ID required by the submission rules.
