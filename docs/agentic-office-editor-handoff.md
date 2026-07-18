# Agentic Office editor fork and SDK handoff

## Purpose

This document is the implementation brief for a separate coding task that will
turn Extend's DOCX and XLSX editors into a polished, SDK-neutral agentic Office
editing foundation. The resulting packages must support Heydesk, but they must
not depend on Heydesk, Codex, TanStack AI, AG-UI, Vercel AI SDK, or a particular
transport.

The product objective is larger than adding a chat panel to an editor. An AI
agent must be able to inspect and operate on the same document canvas as the
user through bounded, typed, revision-aware commands. The user must retain a
first-class editing experience, including selection, formatting, comments,
review, undo, save, and exact Office-file persistence.

This work should happen in a separate repository or isolated feature branch.
Do not make experimental engine changes directly in Heydesk while developing
the reusable packages.

## Source references

Read these sources before changing code:

- Extend UI surface:
  `opensrc/repos/github.com/extend-hq/ui`
- Extend DOCX engine:
  `opensrc/repos/github.com/extend-hq/react-docx`
- Extend XLSX engine:
  `opensrc/repos/github.com/extend-hq/react-xlsx`
- Existing Heydesk integration and product requirements:
  `/Users/manasseh/Projects/hacks/openai/heydesk`
- Current Heydesk document surface:
  `/Users/manasseh/Projects/hacks/openai/heydesk/apps/web/src/features/document`
- Existing Heydesk assistant transport and dynamic-tool lifecycle:
  `/Users/manasseh/Projects/hacks/openai/heydesk/apps/web/src/features/assistant`
  and
  `/Users/manasseh/Projects/hacks/openai/heydesk/apps/server/src/domains/assistant`
- Eigenpal implementation retained as a behavioral reference only:
  `opensrc/repos/github.com/eigenpal/docx-editor`

The audited upstream package versions are:

- `@extend-ai/react-docx@0.8.1`
- `@extend-ai/react-xlsx@0.15.0`

Pin exact versions during the initial implementation. Do not use floating
ranges for an editor engine while its public contracts are still evolving.

## License and publication requirements

Extend UI, `react-docx`, and `react-xlsx` are MIT licensed. The current
`@dukelib/sheets-wasm` dependency used by `react-xlsx` is also MIT licensed.
The MIT license permits use, copying, modification, publication,
redistribution, sublicensing, sale, and commercial use.

It is therefore permissible to:

- fork the repositories;
- modify the source;
- publish derived npm packages under a new scope;
- use the result in Heydesk;
- publish the source publicly;
- use it commercially.

The following obligations and boundaries are non-negotiable:

1. Retain the upstream copyright and MIT permission notice in every copied or
   substantially derived distribution.
2. Ship the upstream licenses in published npm artifacts, not only in the
   GitHub repository.
3. Maintain a `THIRD_PARTY_NOTICES.md` naming Extend, CrowdView Inc., shadcn,
   Duke Sheets, and any other retained dependencies or copied sources.
4. Publish under a distinct package scope. Do not use the `@extend-ai` npm
   namespace or imply that the derivative is an official Extend release.
5. Use distinct package, repository, and product branding. The MIT software
   license does not grant rights to another party's trademarks or logos.
6. Clearly describe the relationship in the README, for example: “Built on
   and derived from the MIT-licensed Extend `react-docx` project.”
7. Preserve license headers in copied files when present.
8. Audit any new dependencies before publication. The permissive status of
   the current dependencies does not automatically cover future additions.

Prefer an additive wrapper and narrowly maintained engine patch over a full
fork at first. A package can be original, publishable work while depending on
the upstream engine. Fork the engine only when the required public API cannot
be added or maintained through a small, reviewable patch.

This section records an engineering license audit, not jurisdiction-specific
legal advice.

## Product principles

The implementation must follow these principles:

1. **The editor is primary.** Chat and agent controls must compose around the
   editor rather than being embedded as a vendor-specific afterthought.
2. **The host owns persistence.** The package produces and consumes bytes; it
   does not choose HTTP, filesystem, database, or cloud storage.
3. **The protocol is SDK-neutral.** Any agent runtime can translate its tool
   calls into the package's typed commands.
4. **Mutations are bounded.** An agent never receives an untyped “run code in
   the document” escape hatch.
5. **Review is first-class.** Direct edits and proposed edits are distinct
   operations with visible authorship and an explicit durable commit point.
6. **Office bytes remain authoritative.** DOCX and XLSX are not converted into
   HTML or Markdown as the durable format.
7. **Editing must be loss-aware.** Unsupported or unsafe structures fail
   closed instead of being silently discarded.
8. **React renders must not destroy editor state.** Selection, focus,
   composition, undo history, and active suggestions survive ordinary host
   renders and autosaves.
9. **The browser remains unprivileged.** Filesystem and process access belong
   to the consuming application, not the editor package.
10. **Local-first operation is supported.** Parsing, editing, calculation, and
    serialization cannot require remote fonts, remote APIs, or a hosted
    conversion service.

## Recommended package shape

Use a small monorepo with clear public boundaries. Placeholder package names
use `<scope>` and must be replaced before publication.

```text
packages/
  protocol/
    @<scope>/agentic-office-protocol
    SDK-neutral commands, events, schemas, results, and errors

  react-docx/
    @<scope>/agentic-docx
    DOCX controller adapter, byte lifecycle, agent operations, and React hooks

  react-xlsx/
    @<scope>/agentic-xlsx
    XLSX controller adapter, byte lifecycle, agent operations, and React hooks

  ui/
    @<scope>/agentic-office-react
    Optional polished toolbar, menus, review UI, and layout components

apps/
  playground/
    Independent DOCX and XLSX fixtures and interactive agent-tool simulator
```

Do not require consumers to install the optional UI package. The controller
and protocol packages must be usable with a completely custom interface.

If the first milestone needs to remain smaller, begin with `protocol` and
`react-docx`. Preserve the package boundaries internally so XLSX does not
force a breaking redesign later.

## Public architectural layers

```text
LLM or agent SDK
  -> provider-specific tool-call translation
  -> Agentic Office command protocol
  -> DOCX or XLSX adapter
  -> editor transaction
  -> review state or direct mutation
  -> byte serialization
  -> host persistence adapter
```

The editor packages must not initiate an LLM request. They expose:

- document inspection APIs;
- typed command definitions and JSON Schemas;
- command execution;
- transaction and review events;
- Office-byte import and serialization;
- optional React presentation.

The consuming application decides how a model is selected, how messages are
streamed, which commands are allowed, and how bytes are stored.

## Shared protocol contracts

Use TypeScript application types and runtime Zod schemas. The JSON-safe
protocol should be versioned independently from either editor engine.

```ts
type OfficeProtocolVersion = "1";

type OfficeDocumentKind = "docx" | "xlsx";

type OfficeDocumentHandle = {
  protocolVersion: OfficeProtocolVersion;
  documentId: string;
  kind: OfficeDocumentKind;
  revision: string;
  engineRevision: number;
};

type OfficeCommandEnvelope<TCommand extends OfficeCommand = OfficeCommand> = {
  id: string;
  document: OfficeDocumentHandle;
  command: TCommand;
  mode: "direct" | "suggest";
  actor: OfficeActor;
  idempotencyKey?: string;
};

type OfficeActor = {
  id: string;
  name: string;
  kind: "human" | "agent" | "system";
};

type OfficeCommandResult<TData = unknown> =
  | {
      ok: true;
      commandId: string;
      changed: boolean;
      revision: string;
      engineRevision: number;
      data?: TData;
      transaction?: OfficeTransactionSummary;
    }
  | {
      ok: false;
      commandId: string;
      error: OfficeCommandError;
    };
```

`OfficeCommandError` must have stable codes:

```ts
type OfficeCommandErrorCode =
  | "INVALID_COMMAND"
  | "STALE_DOCUMENT"
  | "STALE_TARGET"
  | "TARGET_NOT_FOUND"
  | "AMBIGUOUS_TARGET"
  | "UNSUPPORTED_CONTENT"
  | "UNSAFE_MUTATION"
  | "READ_ONLY"
  | "CONFLICT"
  | "SERIALIZATION_FAILED"
  | "ABORTED"
  | "TIMEOUT"
  | "INTERNAL_ERROR";
```

Never use exception messages as the public machine contract. Preserve a safe
human-readable message and structured diagnostic metadata separately.

## Stable targets

Commands must target stable editor identities, not DOM nodes or brittle text
search alone.

DOCX targets should be based on stable `blockId` values and text offsets:

```ts
type DocxTextTarget = {
  kind: "docx-text";
  blockId: string;
  startOffset: number;
  endOffset: number;
  expectedText?: string;
};
```

Table targets must identify their containing table and cell explicitly.
Images, comments, revisions, headers, and footers require their own target
types. Do not overload one string path with several meanings.

XLSX targets should use stable sheet identity and zero-based coordinates while
accepting A1 ranges at the external convenience boundary:

```ts
type XlsxRangeTarget = {
  kind: "xlsx-range";
  sheetId: string;
  start: { row: number; column: number };
  end: { row: number; column: number };
  expected?: XlsxExpectedRangeState;
};
```

Every mutating command must validate both the document revision and target
provenance. A stale handle must never accidentally target a reused paragraph,
revision ID, sheet, or cell range.

## Transaction and event contracts

All mutations must pass through a transaction boundary.

```ts
type OfficeTransactionSummary = {
  id: string;
  commandId: string;
  actor: OfficeActor;
  origin: string;
  mode: "direct" | "suggest";
  startedAt: string;
  completedAt: string;
  affectedTargets: OfficeTarget[];
  undoToken?: string;
};
```

Expose an event subscription independent of React:

```ts
type OfficeEditorEvent =
  | { type: "document.loaded"; document: OfficeDocumentHandle }
  | { type: "document.changed"; transaction: OfficeTransactionSummary }
  | { type: "selection.changed"; selection: OfficeSelection | null }
  | { type: "suggestion.created"; suggestion: OfficeSuggestion }
  | { type: "suggestion.resolved"; suggestionId: string; resolution: "accepted" | "rejected" }
  | { type: "comment.changed"; comment: OfficeCommentSummary }
  | { type: "history.changed"; canUndo: boolean; canRedo: boolean }
  | { type: "serialization.started" }
  | { type: "serialization.completed"; byteLength: number }
  | { type: "error"; error: OfficeCommandError };
```

Every change event must include an origin such as `user`,
`agent:<runId>`, `quick-edit:<id>`, or `external-reload`. This prevents
autosave and agent-preview feedback loops.

## Controller lifecycle and durable bytes

The current Extend controllers favor browser download actions. The reusable
packages need a host-owned byte lifecycle:

```ts
type OfficeByteController = {
  load(input: Uint8Array | ArrayBuffer, options?: LoadOptions): Promise<void>;
  serialize(options?: SerializeOptions): Promise<Uint8Array>;
  getDocumentHandle(): OfficeDocumentHandle;
  isDirty(): boolean;
  markPersisted(revision: string): void;
  subscribe(listener: (event: OfficeEditorEvent) => void): () => void;
};
```

Requirements:

- `serialize()` returns bytes and never initiates a download.
- Downloading a copy is a separate optional UI operation.
- Loading is explicit. A normal React render or successful autosave must not
  reload the editor.
- `markPersisted()` updates the durable baseline without resetting selection,
  history, or composition.
- Imports retain the original OOXML package so untouched Word/Excel structures
  survive serialization.
- Serializations are ordered. If editing continues during serialization, the
  controller exposes that a newer engine revision is dirty.
- A load invalidates all previous target handles and increments an engine
  generation or nonce.
- Serialization supports `AbortSignal` where the underlying runtime permits
  cancellation.

Add explicit regression tests proving that toolbar commands, autosave state
updates, parent renders, theme changes, and assistant streaming do not unmount
the editing engine or drop the native selection.

## DOCX inspection API

The DOCX adapter must expose bounded inspection operations suitable for an
agent. Do not force an agent to ingest an entire large document when it only
needs one section.

Required read operations:

- `get_document_outline`
- `read_blocks`
- `read_selection`
- `read_page`
- `read_pages`
- `find_text`
- `read_table`
- `read_comments`
- `read_suggestions`
- `get_document_styles`
- `get_page_layout`
- `get_current_view`

Read results should contain stable targets, plain content, relevant style
metadata, and bounded neighboring context. They must not expose internal DOM
objects, React state, XML parser objects, or unbounded binary data.

Large results require pagination and maximum response sizes. Images return
metadata and asset IDs by default, not base64 data.

## DOCX mutation API

The agent must be able to operate on the complete supported document canvas,
not only replace strings.

### Text and paragraphs

- Replace, insert, or delete a text range.
- Insert, delete, split, or merge paragraphs.
- Apply bold, italic, underline, strike, color, highlight, font family, and
  font size.
- Apply named paragraph styles and heading levels.
- Set alignment, line spacing, indentation, borders, and list properties.
- Create and remove links.

### Tables

- Insert and delete tables.
- Insert and delete rows and columns.
- Read and update cell contents.
- Apply cell and table formatting supported by the engine.
- Merge or split cells only when safe support exists; otherwise fail closed.

### Images and layout objects

- Insert an image from a host-provided asset ID.
- Resize, move, and set supported wrapping modes.
- Read image dimensions, anchor, wrapping, and alternative text.
- Update alternative text.
- Do not let an agent fetch arbitrary image URLs. The host resolves assets and
  enforces size, media type, and network policy.

### Page and section layout

- Read page size, margins, orientation, columns, headers, and footers.
- Update only the section properties the engine can round-trip safely.
- Header/footer editing must use explicit targets and cannot silently flatten
  fields or unsupported content.

### Comments and review

- Add a real Word comment to a supported range.
- Read comments and thread state.
- Resolve or reopen comments only when the host policy allows it.
- Read imported tracked changes.
- Accepting and rejecting agent suggestions should remain human-only by
  default, while the protocol permits a host to override that policy.

Every public mutation must declare its supported target kinds. Unsupported
fields, drawings, nested revisions, hyperlinks, cross-structure selections,
or unsafe XML must return `UNSUPPORTED_CONTENT` or `UNSAFE_MUTATION` without
modifying the model.

## DOCX suggestion and tracked-change model

The current Extend engine can display and resolve safe imported revisions but
does not publicly create new native Word revisions. Add a conservative native
proposal operation:

```ts
type SuggestDocxTextChangeCommand = {
  type: "docx.suggest_text_change";
  target: DocxTextTarget;
  replacement: string;
};
```

The first implementation should support one safe top-level text paragraph per
command. It must:

1. validate the original paragraph and expected text;
2. allocate collision-safe Word revision IDs;
3. represent removed content with `w:del` and inserted content with `w:ins`;
4. preserve run styling where it is safe;
5. attach agent author and timestamp metadata;
6. update both the normalized model and retained OOXML provenance;
7. participate in undo and redo;
8. render through the existing tracked-change pipeline;
9. serialize to a DOCX that Microsoft Word recognizes as tracked changes;
10. use the existing fail-closed accept/reject machinery.

Reject multiline replacement text in this primitive. A structured
multi-paragraph suggestion must be an atomic list of paragraph-level
operations, not one text node containing newline characters.

Later versions can add structural revisions, but they must not be emulated by
silently destructive direct edits.

If native revision creation cannot be completed in the first milestone,
provide an application-owned suggestion overlay. It must remain non-durable
until Apply, clearly identify changed ranges, and never masquerade as a native
Word revision. The native path remains the target architecture.

## XLSX inspection API

The spreadsheet protocol must be range-oriented and bounded. Required reads:

- `list_sheets`
- `get_workbook_summary`
- `read_range`
- `read_selection`
- `find_cells`
- `read_formulas`
- `read_table`
- `list_tables`
- `list_charts`
- `read_chart`
- `list_images`
- `get_named_ranges`
- `get_current_view`

Responses should distinguish raw values, displayed values, formulas, number
formats, errors, merged cells, hidden rows/columns, and calculated results.
Never serialize an unbounded workbook into one model response.

## XLSX mutation API

Required spreadsheet commands:

- Set or clear cell values.
- Set or clear formulas.
- Apply styles to cells and ranges.
- Fill a range from a source range.
- Insert and delete rows or columns when safely supported.
- Add, rename, reorder, and remove sheets.
- Define or update named ranges.
- Merge and unmerge ranges.
- Create or update tables.
- Sort tables.
- Create or update supported charts and chart-series formulas.
- Insert, move, resize, or remove supported images.
- Update supported form controls.
- Recalculate and return affected formula results.

Do not execute VBA, Excel macros, external connections, arbitrary JavaScript,
or workbook-embedded code.

Excel does not provide the same practical native tracked-change model as the
DOCX flow. Implement agent proposals as an application-level
`XlsxChangeSet`:

```ts
type XlsxChangeSet = {
  id: string;
  actor: OfficeActor;
  baseRevision: string;
  operations: XlsxCommand[];
  affectedRanges: XlsxRangeTarget[];
  status: "pending" | "accepted" | "rejected";
};
```

Pending change sets render as non-durable range highlights and a structured
before/after review panel. Apply executes the operations atomically against
the acknowledged base revision. Reject discards the overlay without changing
workbook bytes.

## Agent-tool compatibility layer

Provide a generic tool adapter rather than importing an agent SDK:

```ts
type OfficeToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  mutating: boolean;
  execute(
    input: unknown,
    context: OfficeToolExecutionContext
  ): Promise<OfficeCommandResult>;
};

type OfficeToolExecutionContext = {
  signal?: AbortSignal;
  actor: OfficeActor;
  mode: "direct" | "suggest";
  permissions: OfficeToolPermissions;
};
```

Expose helpers such as:

```ts
createDocxToolCatalog(controller, options): OfficeToolDefinition[];
createXlsxToolCatalog(controller, options): OfficeToolDefinition[];
```

Consumers can translate these definitions into Codex dynamic tools, OpenAI
function tools, MCP tools, Vercel tools, TanStack tools, or another runtime.
Tool names and schemas must remain stable and versioned.

The tool executor must support:

- exact allowlists;
- read versus mutation permissions;
- maximum input and result sizes;
- abort and timeout handling;
- idempotency keys for mutating calls;
- serialized mutations per document;
- stale revision rejection;
- safe error serialization;
- optional audit hooks;
- no global singleton listeners.

Do not expose the raw engine controller as a generic model tool. The typed
protocol is the security and compatibility boundary.

## React and UI contracts

The optional UI layer should supply polished defaults while preserving total
composition control.

Required composition points:

- custom toolbar or toolbar slots;
- custom icons;
- custom file/title chrome;
- custom left navigation or thumbnail rail;
- custom right assistant/review rail;
- custom selection bubble menu;
- custom context menu;
- custom tracked-change cards;
- custom comment cards;
- custom empty, loading, error, and conflict states;
- controlled read-only and review modes;
- CSS variables or unstyled/headless variants.

The document editor must never own or render an AI conversation by default.
The host composes its assistant beside the canvas.

Do not hardcode Extend, Heydesk, or a specific icon library into the headless
packages. The optional default UI may choose icons, but all important controls
must be replaceable.

Selection menus must preserve the browser selection while their buttons,
popovers, or command inputs receive focus. Add regression tests for mouse,
keyboard, touch, and IME composition behavior.

## Persistence adapter

Provide an optional host adapter contract without implementing storage:

```ts
type OfficePersistenceAdapter = {
  read(signal?: AbortSignal): Promise<{
    bytes: Uint8Array;
    revision: string;
  }>;
  write(input: {
    bytes: Uint8Array;
    expectedRevision: string;
    origin: string;
    signal?: AbortSignal;
  }): Promise<{ revision: string }>;
};
```

The reusable editor may include an autosave coordinator that uses this
adapter, but it must not issue `fetch` calls itself. The coordinator must:

- debounce normal user edits;
- serialize saves;
- queue a newer save when edits continue;
- preserve selection and history after save;
- detect revision conflicts;
- distinguish clean external reloads from dirty conflicts;
- flush before navigation and agent submission;
- prevent agent previews from triggering user autosave;
- expose `Saving`, `Saved`, `Unsaved`, `Conflict`, and `Error` state.

## Performance and desktop packaging

- Keep DOCX and XLSX in separate lazy chunks.
- Lazy-load and optionally prewarm each WASM runtime.
- Keep parsing and large serialization work in workers where supported.
- Provide explicit WASM URL configuration for Vite, Electron, and Tauri.
- Do not include either editor in the application's initial entry bundle.
- Virtualize pages, sheets, and large ranges without losing selection.
- Avoid remote fonts and runtime CDN dependencies.
- Clean up workers, object URLs, detached React roots, timers, and observers on
  unmount.
- Do not globally replace `console.error` to hide engine warnings. Fix or
  narrowly contain the underlying warning.
- Include a production bundle report and verify that WASM is emitted as a
  static asset rather than embedded in JavaScript.

## Compatibility with Heydesk

The generic packages must be capable of satisfying Heydesk's existing flow:

1. The local server returns DOCX or XLSX bytes plus a SHA-256 revision.
2. The browser loads bytes into a stable editor controller.
3. A document-scoped Codex thread emits a dynamic tool call.
4. Heydesk claims the tool call over its existing HTTP API.
5. The browser translates it into an `OfficeCommandEnvelope`.
6. The editor executes the bounded command.
7. A mutating result is serialized and revision-checked against the server.
8. Only after durable save does the browser respond successfully to Codex.
9. The assistant receives a compact result and continues its turn.
10. Proposed edits remain pending until the user accepts or rejects them.

The reusable package must not import Heydesk types. Heydesk will own a thin
adapter translating between its dynamic-tool events and the generic protocol.

## Test requirements

### Protocol

- Runtime validation for every command and result.
- Stable JSON Schema snapshots.
- Unknown command and unknown protocol-version rejection.
- Stale document and stale target rejection.
- Idempotent duplicate mutation handling.
- Abort, timeout, oversized input, and oversized result handling.

### DOCX engine

- Load, edit, serialize, reopen, and compare exact supported content.
- Untouched OOXML part preservation.
- Selection persistence across parent renders and autosaves.
- Undo/redo after user and agent transactions.
- Simple and styled text replacements.
- Multi-paragraph direct edits.
- Tables, images, headers, footers, comments, fields, and existing revisions.
- Safe native suggestion creation, Word-visible authorship, accept, reject,
  save, and reopen.
- Fail-closed behavior for unsupported revision structures.
- Microsoft Word round-trip validation for representative fixtures.

### XLSX engine

- Load, edit, serialize, reopen, and verify formulas and styles.
- Cell/range operations and recalculation.
- Tables, charts, images, merged cells, named ranges, and multiple sheets.
- Change-set preview, atomic apply, reject, and stale-base failure.
- Preserve unsupported workbook parts wherever the underlying engine permits.
- Open exported fixtures in Excel or LibreOffice as a manual validation step.

### React

- Toolbar interaction does not lose text or range selection.
- Assistant streaming renders do not remount the editor.
- Bubble and context menus preserve the captured selection.
- Controlled read-only mode still permits programmatic agent transactions when
  explicitly authorized.
- Unmount cleans up workers, roots, object URLs, and subscriptions.

### Package publication

- `npm pack` contains compiled code, types, README, LICENSE, and third-party
  notices.
- Published packages do not contain private fixtures, credentials, absolute
  paths, or Heydesk source.
- A clean external fixture application can install and use each package.
- ESM and the documented bundler targets work.

## Milestones

### Milestone 0 — Repository and legal foundation

- Choose a new package scope and branding.
- Copy or fork only the required source.
- Add upstream licenses and third-party notices.
- Pin audited upstream versions.
- Add a playground and CI.

### Milestone 1 — Stable DOCX controller

- Load bytes without remounting.
- Return serialized bytes without downloading.
- Emit revisioned change events with origins.
- Preserve selection and history through save-state renders.
- Demonstrate import, edit, serialize, reopen.

### Milestone 2 — Heydesk-quality DOCX surface

- Refactor the copied Extend UI monolith into composable controls.
- Use replaceable primitives and icons.
- Add custom selection and context menus.
- Add an external assistant-rail composition example.
- Remove global warning suppression and vendor-specific chrome.

### Milestone 3 — Generic agent read and direct-edit protocol

- Publish protocol schemas.
- Implement bounded DOCX read tools.
- Implement direct text, formatting, table, image, and comment commands.
- Add transaction, idempotency, stale-target, and audit behavior.
- Add a fake-agent tool-call playground.

### Milestone 4 — Native DOCX suggestions

- Create safe Word `w:ins`/`w:del` revisions.
- Render custom review cards.
- Accept/reject and serialize through Word-recognized tracked changes.
- Validate with the Word fidelity harness.

### Milestone 5 — XLSX controller and protocol

- Return durable workbook bytes.
- Implement bounded read and mutation commands.
- Add range-based proposal overlays and change sets.
- Demonstrate formula, style, table, and chart edits.

### Milestone 6 — Publication and Heydesk integration

- Publish prerelease packages under the new scope.
- Integrate through a thin Heydesk adapter.
- Run actual Codex DOCX and XLSX journeys.
- Record remaining unsupported features honestly.

## First vertical demo

Before broad feature work, complete this exact DOCX journey:

1. Open the existing `Codex Is Fun!.docx` fixture.
2. Select text and apply bold without losing selection.
3. Type, autosave to returned bytes, reload, and verify persistence.
4. Open the Heydesk-style assistant rail outside the editor.
5. Simulate a generic agent `read_selection` call.
6. Simulate a direct formatting command.
7. Create one single-paragraph native tracked replacement authored by the
   agent.
8. Reject it, create it again, accept it, and serialize.
9. Reopen the result in the editor and Microsoft Word.

Do not begin XLSX implementation until this journey is stable. The Word slice
validates the lifecycle, protocol, persistence, and review architecture that
XLSX will reuse.

## Definition of done

The project is ready for Heydesk adoption when:

- the editor remains mounted and preserves selection during save and chat
  activity;
- the host can load and persist exact Office bytes;
- agent tools are typed, bounded, versioned, and SDK-neutral;
- direct edits cover text, formatting, tables, images, and comments within
  explicitly supported limits;
- DOCX suggestions are reviewable and Word-compatible;
- XLSX proposals are reviewable change sets;
- stale targets and unsafe content fail without mutation;
- the UI is fully composable and does not own the assistant;
- license and attribution files ship with every package;
- the packages work in a clean Vite application and remain compatible with a
  future Electron or Tauri host;
- the end-to-end fixtures reopen correctly in Microsoft Word and Excel.

## Instructions to the implementing coding agent

1. Read this document completely before making changes.
2. Inspect the exact upstream source and tests, not only README examples.
3. Confirm the working repository and branch before editing. Keep experimental
   package work isolated from Heydesk.
4. Preserve upstream license notices from the first commit.
5. Begin with the first vertical demo and the smallest public contracts needed
   to complete it.
6. Do not copy the entire engine merely to change the toolbar. Use the public
   controller and a narrow patch first.
7. Do not couple the protocol to Codex or any chat SDK.
8. Do not expose raw DOM, raw React state, arbitrary code execution, or direct
   filesystem access as agent tools.
9. Add tests with each public operation and run type checks and production
   builds before handoff.
10. After each coherent milestone, report the implemented journey, public API,
    validation performed, upstream changes retained, and remaining fidelity
    risks before committing.
