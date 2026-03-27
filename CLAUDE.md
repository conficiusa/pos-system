# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Next.js dev server (standard Node)
pnpm preview                # Run on local Cloudflare Workers runtime
pnpm build                  # Production build
pnpm deploy                 # Build + deploy to Cloudflare Workers

# Linting
pnpm lint                   # Run ESLint

# Database
pnpm db:generate            # Generate Drizzle migrations from schema changes
pnpm db:migrate:local       # Apply migrations to local D1 database
pnpm db:migrate:remote      # Apply migrations to remote D1 database
pnpm db:studio              # Open Drizzle Studio for local DB
pnpm db:setup:local         # Initial local DB setup

# Auth
pnpm auth:schema:generate   # Regenerate Better Auth schema (run after auth config changes)

# Cloudflare
pnpm cf-typegen             # Regenerate cloudflare-env.d.ts from wrangler.jsonc bindings
```

## Architecture

### Hosting & Runtime
The app runs on **Cloudflare Workers** via [OpenNextJS](https://opennext.js.org/cloudflare). Use `pnpm preview` (not `pnpm dev`) to test Cloudflare-specific behavior. The worker name is `pos` (wrangler.jsonc).

### Database
**Cloudflare D1** (SQLite) accessed via **Drizzle ORM**. The D1 binding is named `DB` in the Cloudflare environment.

- Schemas: `src/lib/db/schemas/` — one file per domain, exported through `index.ts`
- DB instances: `src/lib/db/index.ts` — `getDb(env)` for normal routes, `getDbAsync()` for static routes (uses local file path for dev)
- Migrations output to `drizzle/`
- After modifying schemas, run `pnpm db:generate` then `pnpm db:migrate:local`

### Authentication
**Better Auth** with email/password, bearer token, custom session, and admin plugins.

- Server instance: `src/lib/auth.ts`
- Config/plugins: `src/lib/auth.config.ts`
- Client: `src/lib/auth-client.ts` (use `useSession`, `signIn`, `signOut`)
- API catch-all: `src/api/auth/[...all]/route.ts`
- `better-auth.config.ts` at root is only used by `pnpm auth:schema:generate`

### Domain Model (Gold/Jewelry POS)
- **Customers** — profile + rolling `ledgerBalance`
- **Orders** — gold intake records (weight, purity, estimated value); status: `pending` → `reconciled`
- **Valuations** — true/final pricing applied on "Thursday"; linked 1:1 to an order
- **LedgerEntries** — append-only audit log; types: `payout | credit | debit`
- **SyncQueue** — offline-first sync via IndexedDB + service worker (`src/services/sync/`)

### App Structure
- `src/app/(dashboard)/` — all authenticated routes grouped under the dashboard layout
- `src/components/dashboard/` — shell, sidebar, topbar layout components
- `src/components/ui/` — shadcn/ui components (do not edit manually; use `shadcn` CLI)
- `src/services/` — data access layer (DAL) functions, one folder per domain
- `src/lib/` — shared utilities, auth, DB

### Path Aliases
`@/*` maps to `src/*`.

### Environment Variables
Parsed via `src/lib/get-env.ts`. Cloudflare bindings (D1, IMAGES, ASSETS) are typed in `cloudflare-env.d.ts` (auto-generated — do not edit manually).
