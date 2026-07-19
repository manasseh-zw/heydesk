# heydesk

This project was created with Better-T-Stack, a modern TypeScript stack that combines React, TanStack Router, Hono, and more.

## Features

- **TypeScript** - For type safety and improved developer experience
- **TanStack Router** - File-based routing with full type safety
- **TailwindCSS** - Utility-first CSS for rapid UI development
- **Shared UI package** - shadcn/ui primitives live in `packages/ui`
- **Hono** - Lightweight, performant server framework
- **Node.js** - Runtime environment
- **Drizzle** - TypeScript-first ORM
- **SQLite/Turso** - Database engine
- **Turborepo** - Optimized monorepo build system

## Getting Started

First, install the dependencies:

```bash
pnpm install
```

## Database Setup

This project uses SQLite with Drizzle ORM.

1. Start the local SQLite database (optional):

```bash
pnpm run db:local
```

2. Update your `.env` file in the `apps/server` directory with the appropriate connection details if needed.
3. Apply the schema to your database:

```bash
pnpm run db:push
```

Then, run the development server:

```bash
pnpm run dev
```

Open [http://localhost:3001](http://localhost:3001) in your browser to see the web application.
The API is running at [http://localhost:3000](http://localhost:3000).

### Desktop development

Heydesk also ships an Electron shell that supervises the same Hono server and
React application used during browser development:

```bash
pnpm run dev:desktop
```

Build an unpacked Apple Silicon application for the fastest local packaging
check:

```bash
pnpm run desktop:package:dir
```

Create unsigned Apple Silicon DMG and ZIP artifacts in
`apps/desktop/release/`:

```bash
pnpm run desktop:package:mac:unsigned
```

Unsigned applications are development artifacts and will trigger macOS
Gatekeeper on other machines. The desktop CI workflow can use the
`CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` repository secrets to
produce a signed and notarized build.

Every push to `main` runs the desktop validation and packaging pipeline, then
publishes an incremental `v0.0.x-preview` GitHub prerelease with generated
change notes, a DMG, and a ZIP. These snapshots are intentionally marked as
prereleases because builds remain unsigned until Apple signing credentials are
configured. Pushing a deliberate `v*` tag creates a draft release instead, so
its notes and promotion can be reviewed manually.

## UI Customization

React web apps in this stack share shadcn/ui primitives through `packages/ui`.

- Change design tokens and global styles in `packages/ui/src/styles/globals.css`
- Update shared primitives in `packages/ui/src/components/*`
- Adjust shadcn aliases or style config in `packages/ui/components.json` and `apps/web/components.json`

### Add more shared components

Run this from the project root to add more primitives to the shared UI package:

```bash
npx shadcn@latest add accordion dialog popover sheet table -c packages/ui
```

Import shared components like this:

```tsx
import { Button } from "@heydesk/ui/components/button";
```

### Add app-specific blocks

If you want to add app-specific blocks instead of shared primitives, run the shadcn CLI from `apps/web`.

## Project Structure

```
heydesk/
├── apps/
│   ├── web/         # Frontend application (React + TanStack Router)
│   ├── server/      # Backend API (Hono)
│   └── desktop/     # Electron lifecycle and packaging shell
├── packages/
│   ├── ui/          # Shared shadcn/ui components and styles
│   └── db/          # Database schema & queries
├── docs/            # Product context, decisions, and submission material
└── AGENTS.md        # Repository architecture and contribution guidance
```

Read [AGENTS.md](AGENTS.md) before adding a feature. Heydesk uses domain-first
vertical slices: a user-facing route should be traceable through its feature,
client operation, Hono route, domain service, and durable boundary.

## Available Scripts

- `pnpm run dev`: Start all applications in development mode
- `pnpm run build`: Build all applications
- `pnpm run dev:web`: Start only the web application
- `pnpm run dev:server`: Start only the server
- `pnpm run dev:desktop`: Start the Electron app with live renderer updates
- `pnpm run build:desktop`: Build the server, main, preload, and renderer bundles
- `pnpm run desktop:package:dir`: Build an unpacked Apple Silicon app
- `pnpm run desktop:package:mac:unsigned`: Build unsigned DMG and ZIP artifacts
- `pnpm run check-types`: Check TypeScript types across all apps
- `pnpm run db:push`: Push schema changes to database
- `pnpm run db:generate`: Generate database client/types
- `pnpm run db:migrate`: Run database migrations
- `pnpm run db:studio`: Open database studio UI
- `pnpm run db:local`: Start the local SQLite database
