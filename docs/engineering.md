# Heydesk — Product and Engineering Context

The implementation decisions and iteration history behind this context are documented in `architecture-decisions.md`.

## North star

Heydesk is a local-first, AI-native workspace for people and teams who need to organize company knowledge and turn that knowledge into useful work.

The north-star experience is:

> A user opens a private workspace, gives Heydesk natural-language context about what is happening, and asks it to organize information, update structured records, or produce a polished document. Heydesk uses Codex as the intelligent operator, keeps the work grounded in the local workspace, makes its actions visible, and leaves behind durable, editable artifacts.

Heydesk should feel like a calm, well-organized company operating system: part knowledge base, part structured workspace, part document studio, and part accountable AI collaborator.

## The problem

Important work context is scattered across markdown files, documents, spreadsheets, meeting notes, task trackers, and conversations. Each tool may store its own piece of the story, but none of them reliably connects the facts, decisions, and open questions that matter for the next piece of work.

As a result, people spend time searching for source material, reconstructing past decisions, checking whether information is current, and repeating the same context in multiple places. Producing a trustworthy update, plan, decision record, or formal document becomes a manual synthesis task—and important details can be missed along the way.

Heydesk connects company knowledge, turns context into useful work, and leaves an editable, durable result.

## Product thesis

The product is not “Notion with a chatbot.” It is not “a local Codex clone.” It is not an autonomous agent that silently changes important information.

Heydesk’s distinctive product thesis is:

> Codex becomes the intelligence and action layer for a private, local-first workspace where structured knowledge and durable documents live together.

The user should be able to understand what Heydesk knows, what it changed, why it changed it, and what artifact was produced.

## Operating principles

### Local-first by default

Workspace data, documents, and generated artifacts should live on the user’s machine. The product should remain useful without a remote Heydesk backend. External services should be explicit integrations rather than hidden requirements.

### Workspace context is the primary interface

The user should not need to repeatedly assemble context manually. Heydesk should understand the selected workspace, its pages, records, documents, references, and recent activity, while allowing the user to control which context is used for a task.

### Codex is an accountable operator

Codex should reason about the workspace and execute meaningful actions through structured commands. It should not receive unrestricted, ambiguous authority to mutate the application state. Important actions should be inspectable, validated, and reviewable.

### Files remain useful outside Heydesk

Long-form content should remain readable and portable as Markdown or standard document files. The workspace should not trap the user’s knowledge inside an opaque proprietary format.

### State is observable

When Heydesk is working, the interface should show progress and changes as they happen. The user should see drafts, actions, previews, and final commits rather than waiting through an opaque loading state.

### The system is recoverable

A failed model call, interrupted process, malformed action, or rejected change should not destroy the workspace. Changes should have clear status, revision information, and a path to retry or undo.

### Human control remains central

Heydesk can automate organization and drafting, but the user remains the owner of important facts, decisions, communications, and final documents.

## What Heydesk models

### Workspace

A workspace is the boundary for a company, project, or personal operating area. It contains files, pages, structured collections, generated documents, configuration, and activity.

### Pages

Pages are human-readable knowledge artifacts. They may contain Markdown content, metadata, links, references, and relationships to structured records.

### Collections and records

Collections represent structured tables of information such as leads, tasks, meetings, decisions, financial items, roadmap entries, or content calendars. Records are typed objects inside collections.

### Properties

Properties describe typed fields on records and pages. They may include text, numbers, dates, booleans, statuses, selections, relations, and arrays. Property definitions should be represented as schemas rather than hardcoded UI assumptions.

### Documents

Documents are durable outputs, including board updates, company reports, proposals, operating plans, meeting briefs, and formal Word files. A document may draw on multiple pages and collections while preserving the provenance of the context used to create it.

### References

References identify the pages, records, files, or workspace locations that support an answer or generated artifact. They help the user inspect and trust the result. that means.

### Runs and actions

A run represents a piece of work performed by Heydesk and Codex. It contains user intent, selected context, assistant reasoning/output as appropriate for the integration, structured actions, approvals, events, errors, and final results.

### Events and revisions

Events describe observable changes such as a draft beginning, a page being updated, a record changing, a file being written, a document being generated, or a run failing. Revisions make changes understandable and recoverable.

## Core product experiences

### Workspace navigation

The user can open a workspace, browse pages and collections, search across local knowledge, and see recently changed or generated artifacts.

### Structured knowledge management

The user can create and edit typed collections and records while retaining the flexibility of human-readable pages and files.

### Contextual conversation

The user can chat with Heydesk from the workspace or a specific page. Heydesk should understand the relevant local context without requiring the user to restate everything manually.

### Visible editing

When Codex changes a page or document, Heydesk should show the operation in progress. The ideal experience is a live draft or patch preview where content appears to be authored in place, followed by a clear committed result.

The system should stream temporary draft state rather than writing every model token directly to the durable file or database.

### Document creation

The flagship workflow is asking Heydesk to create a polished document from workspace context—for example, an update to company board members using financial information, decisions, progress, and relevant operating data.

The output should be editable, previewable, exportable, and grounded in the workspace rather than being a generic blank document generated from a short prompt.

### Review and trust

The user should be able to inspect what changed, which sources were used, what actions Codex took, and whether a result was committed. The product should make confidence proportional to evidence.

## High-level architecture

```text
Electron desktop shell
        |
        v
React + Vite + TanStack UI
        |
        v
Hono + Node application service
        |
        +--> TanStack Query server-state cache
        |       |
        |       +--> SQLite + Drizzle structured persistence
        |
        +--> Workspace filesystem
        |       +--> Markdown pages
        |       +--> source files and attachments
        |       +--> generated DOCX/PDF artifacts
        |
        +--> Codex app-server integration
                +--> GPT-5.6/Codex sessions
                +--> structured actions
                +--> streamed events
```

## Technology direction

### Electron

Electron provides a desktop shell and controlled access to the local filesystem, workspace folders, child processes, and native capabilities. macOS is the primary demonstration platform; cross-platform support should be designed for but not allowed to compromise the core experience.

### React, Vite, and TanStack

React and Vite provide the fast, familiar UI development loop. TanStack Router and related TanStack primitives provide typed navigation and application structure without forcing a hosted architecture.

### Hono and Node.js

Hono is the local application boundary between the UI and privileged operations. The Node service owns filesystem access, Codex process communication, document generation, validation, and event streaming. Hono is still useful even in a local desktop app because it gives the product a clean command and event interface.

### SQLite

SQLite is the durable structured-state layer for the current proving ground.
Drizzle owns the schema and typed repository queries, while the Hono server
remains the only writer boundary. TanStack Query caches server snapshots and
invalidates them when normalized server events arrive; it is not a database
or a replacement for transactions.

The eventual product may evaluate RxDB for richer reactive collections and
replication, but it is intentionally deferred until the command and event
contracts have earned that complexity.

### Markdown and the filesystem

Markdown files are portable, inspectable workspace artifacts. Heydesk should maintain a clear synchronization policy between reactive workspace state and files on disk. A committed page should be readable outside Heydesk, while the application should maintain enough indexed metadata for fast navigation, search, and relationships.

### Codex app-server

Codex is the intelligence and execution layer. Heydesk should communicate with the local Codex app-server through its supported protocol, maintain session identity, handle streamed events and approvals, and translate assistant intent into validated workspace commands.

The integration should demonstrate more than sending a prompt and displaying text. The important behavior is:

1. Heydesk supplies selected workspace context.
2. Codex interprets the user’s request.
3. Codex proposes or performs structured actions.
4. Heydesk validates and applies those actions.
5. The UI streams progress and previews.
6. The final page, record, or document is committed locally.

### Document generation

Document generation should be treated as an artifact pipeline: gather context, define the document intent and structure, draft, render or preview, allow revision, and export a standard document format. Word document creation is a major differentiator because it connects workspace knowledge to a concrete business deliverable.

## Data and command boundaries

The system should distinguish between:

- durable workspace state;
- temporary streamed draft state;
- assistant messages;
- requested actions;
- validated mutations;
- filesystem writes;
- generated artifacts;
- audit and activity events.

Codex should not directly invent database mutations without a contract. Prefer typed action shapes such as:

- create page;
- update page content;
- create or update record;
- change property;
- create document;
- attach reference;
- request user approval;
- mark an action complete or failed.

Each action should be attributable to a run and should be possible to validate before it is committed.

## Live-update model

Live updates should be event-driven rather than implemented by repeatedly refetching the entire workspace.

Conceptual event types include:

- `run_started`;
- `assistant_message_delta`;
- `action_started`;
- `draft_delta`;
- `preview_updated`;
- `record_changed`;
- `page_committed`;
- `document_generated`;
- `action_failed`;
- `run_completed`.

The UI can render draft events immediately, while durable RxDB/file updates happen at well-defined commit points. This gives Heydesk the feeling of live authorship without making the underlying data unreliable.

## What Heydesk should eventually become

The long-term product can support:

- multiple workspaces and workspace templates;
- richer collections and relational views;
- document templates and organizational style memory;
- source-aware reports and board materials;
- local semantic search and contextual retrieval;
- background organization and inbox processing;
- integrations with external services under explicit user control;
- multi-device synchronization;
- collaborative editing and conflict handling;
- specialized workspace agents;
- review queues and approval policies;
- reusable business workflows.

These are extensions of the north star, not requirements to claim in the initial submission.

## Explicit non-goals for the product direction

Heydesk should not become:

- a generic chat wrapper around Codex;
- a copy of Notion’s entire product surface;
- an opaque autonomous agent with unreviewable side effects;
- a cloud-only SaaS product that requires uploading a company’s private workspace;
- a document editor that cannot preserve portable files;
- a feature collection with no clear central workflow.

## Engineering quality bar

The implementation should be:

- typed at the boundaries;
- schema-validated;
- observable through events and activity history;
- resilient to interrupted runs;
- explicit about permissions and approvals;
- portable across the declared desktop platform;
- easy to run from a clean checkout;
- honest about what is implemented versus planned.

The repository should make the architecture legible. A reviewer should be able to see where the UI, local service, RxDB model, filesystem layer, Codex integration, document pipeline, and event transport live.

## Definition of the north-star success

Heydesk succeeds when a user can say:

> “This is the private workspace where my company’s knowledge lives. I can ask Heydesk to understand that knowledge, organize it, change it visibly, and turn it into a finished document. I can inspect the result, trust where it came from, and still access my files without Heydesk.”

That is the product we are building toward. The implementation workspace should decide the smallest credible demonstration of this promise while preserving the underlying principles.