# Van Cortlandt Park — Bench Adoption

A demo application with a public bench registry and an open staff workspace. PostgreSQL as single source of truth for inventory, donors, and adoption periods.

**This is a demonstration, not the park's live adoption system.** The seed contains 520 fictional bench locations and fictional donor records. Only the park boundary and area polygons come from official NYC Parks data. No payments or emails are sent.

## Local development

Use Node 24 (`nvm use`) and install the locked dependencies with `npm ci`.

```sh
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

The local database listens on `127.0.0.1:54329`. The seed skips an existing inventory. Tests use separate local databases and reject hosted database URLs.

## Cloudflare deployment

The public demo is deployed at [van-cortlandt-bench-adoption.7traynor.workers.dev](https://van-cortlandt-bench-adoption.7traynor.workers.dev). The staff editor is intentionally open; use fictional contact information only.

The app runs on Cloudflare Workers through vinext. Its `HYPERDRIVE` binding connects to Neon project `lingering-bird-63828247` (`vcp-bench-demo`), branch `production`, database `neondb`. Hyperdrive query caching is disabled so reads reflect completed writes immediately. Each Worker request owns its database pool, including streamed responses; Hyperdrive manages upstream connection pooling.

The existing `vcp-bench-adoption` Worker is a separate demo. This repository deploys only `van-cortlandt-bench-adoption` in the personal Cloudflare account selected by `wrangler.jsonc`.

### Connect a workspace to Neon

The setup uses the `vcp-bench-demo` CLI profile with credentials in macOS Keychain. On a new machine, install the Neon CLI, then create that profile with `neon profile create vcp-bench-demo --keyring` and sign in to the account that owns the project.

```sh
neon link --profile vcp-bench-demo --project-id lingering-bird-63828247 --branch production -y --no-env-pull --no-config
neon config plan --profile vcp-bench-demo
neon deploy --profile vcp-bench-demo --no-env-pull
```

`neon.ts` intentionally declares no optional services. `neon deploy` reconciles Neon configuration; it does not publish the website. Always use `--no-env-pull`: both linking and deploying otherwise write database credentials into an environment file. `.neon` contains workspace identifiers and is ignored by Git. Neon MCP uses OAuth without an API key in agent configuration.

### Release manually

Authenticate Wrangler with `npx wrangler login`, verify the personal account with `npx wrangler whoami`, then run:

```sh
npm run deploy
```

This builds from the source configuration and deploys the generated Worker and static assets. GitHub Actions runs checks only; it does not deploy. No database migration or seed runs automatically during release.

When a release requires database migrations, inspect the target first and inject credentials only into the command's environment:

```sh
npx neon-env run --profile vcp-bench-demo -- npm run db:migrate
```

The initial empty database has already been migrated and seeded. Do not point database reset tests at production. For a code rollback, select the previous version in Cloudflare; database changes are not rolled back with Worker code.

### Verify the Workers runtime locally

```sh
npm run cf:types
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=postgresql://postgres:unused@127.0.0.1:54329/bench_adoption
npm run build:vinext
npm run test:e2e:workers
npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

The browser test command overrides Hyperdrive with the isolated local test database. The `unused` password is a placeholder required by the local emulator; local PostgreSQL uses trust authentication. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chromium browser if Playwright's browser is unavailable. `npm run typecheck` regenerates Next.js route types because Next.js and vinext both write `.next/types`.

Regenerate binding types after changing Wrangler bindings. Worker logs and sampled traces are enabled; use `npx wrangler tail` to inspect a release.

## Structure

```text
src/app/                  Pages, layouts, and thin HTTP route handlers
src/features/
  benches/                Public queries, registry, detail screen, map, geography
  adoptions/              Calendar rules, validation, transactional adoption operations
  management/             Staff tables, editor, inventory/contact operations
  imports/                CSV parsing, preview/commit transaction, import screen
  shared/                 Error handling, request boundaries, small UI primitives
src/db/                   Drizzle schema and PostgreSQL connection pool
drizzle/                  Versioned SQL migrations, including the overlap constraint
scripts/                  Migrate, seed, refresh geography
tests/                    Unit, real-database integration, and browser tests
```

```mermaid
flowchart LR
  Public[Public map and adoption form] --> API[Next.js route handlers]
  Staff[Open staff workspace] --> API
  API --> Domain[Adoption and inventory operations]
  API --> Import[CSV preview and commit]
  Import --> Domain
  Domain --> DB[(PostgreSQL)]
  DB --> Audit[Audit history]
```

The core records are **bench**, **donor**, and **adoption**. A donor can adopt multiple benches over time; a bench can have many historical adoptions. Public credit belongs to each adoption, so changing a contact's name does not silently rewrite earlier dedications. Bench codes are permanent identifiers. Cancellation and retirement preserve records instead of deleting them.

## Geography sources

The checked-in geometry was retrieved from [NYC Parks Properties](https://data.cityofnewyork.us/Recreation/Parks-Properties/enfh-gkve) and [NYC Parks Zones](https://data.cityofnewyork.us/City-Government/Parks-Zones/4j29-i5ry), filtered to `gispropnum='X092' AND retired=false`.

The map credits [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
