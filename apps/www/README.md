# Heydesk marketing site

Standalone React + TypeScript + Vite app for the Heydesk marketing surface.
Tailwind CSS is integrated through the Vite plugin, with no dependency on the
desktop editor, server, or shared UI package.

## Local development

From the repository root:

```bash
pnpm dev:www
```

Or from this directory:

```bash
pnpm dev
```

## Vercel

Create a Vercel project with `apps/www` as its Root Directory. The default
Vite settings work as-is:

- Build command: `pnpm build`
- Output directory: `dist`
