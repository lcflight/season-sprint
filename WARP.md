# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Repository overview
- Monorepo managed with pnpm workspaces (pnpm-workspace.yaml), packages in packages/*
- Packages:
  - packages/web: Vue 3 app (Vue CLI 5), Vitest for tests, ESLint via vue-cli-service
  - packages/server: Cloudflare Worker using Hono (TypeScript), built/run via Wrangler

Conventions
- Use pnpm for all operations (installation, scripts, adding deps)
- Run package-specific scripts from the repo root using pnpm --filter (alias -F)

Common commands
Install dependencies (all packages)
- pnpm install

Web app (packages/web)
- Dev server (hot reload): pnpm -F web run serve
- Build for production: pnpm -F web run build
- Lint: pnpm -F web run lint
- Run all tests (CI mode): pnpm -F web run test
- Watch tests interactively: pnpm -F web exec vitest
- Run a single test file: pnpm -F web exec vitest run path/to/file.test.ts
- Run tests matching a name: pnpm -F web exec vitest run -t "substring or /regex/"
- Run data scraping script: pnpm -F web run scrape:finals

Cloudflare Worker API (packages/server)
- Local dev: pnpm -F server run dev
- Deploy (minified): pnpm -F server run deploy
- Generate/sync Cloudflare types: pnpm -F server run cf-typegen

Notes
- Vitest config (packages/web/vitest.config.js) sets test.environment = "node" and alias @ -> src
- ESLint config is embedded in packages/web/package.json and uses plugin:vue/vue3-essential and eslint:recommended
- Auth/UI dependencies in web include @clerk/vue and @clerk/themes
- The server uses Hono v4 on Cloudflare Workers with Wrangler. When instantiating Hono, bind environment types as per the server README:
  - Hono<{ Bindings: CloudflareBindings }>

High-level architecture
- packages/web (frontend): SPA built with Vue 3 (Vue CLI). Source follows standard Vue CLI conventions; module alias @ points to src for clean imports. Testing uses Vitest. Linting is handled via vue-cli-service lint with ESLint v7 and eslint-plugin-vue.
- packages/server (backend/edge): Cloudflare Worker powered by Hono, configured and run via Wrangler. TypeScript compiler options target ESNext with Bundler resolution and JSX via hono/jsx for any server-side templating. CloudflareBindings types can be generated with Wrangler and passed to Hono’s generic to get strongly-typed environment bindings.
- The two packages are decoupled; develop and deploy them independently. The web app likely consumes APIs exposed by the Worker, but there is no direct build-time coupling between them in this repository.

