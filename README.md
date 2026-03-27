# Gold POS

A Point of Sale system for gold buying businesses. Handles customer registration, gold intake orders, Thursday reconciliation, ledger accounting, and business reporting — deployed on Cloudflare Workers with offline-first support.

## Features

- **Customer Registry** — Create and search customers with Ghana Card / Passport / Voter ID / SSNIT identification. Each customer maintains a rolling ledger balance (credits and arrears).
- **Gold Intake Orders** — Record gold weight, estimated rate, and calculated payout at the time of intake. Ledger adjustments from prior balances are applied automatically. Orders are assigned sequential numbers (e.g. `ORD-0001-26`).
- **Thursday Reconciliation** — Apply true/final valuations to pending orders once the gold price is confirmed. Generates ledger entries for over/underpayments.
- **Ledger** — Append-only audit log of all financial events: `payout`, `credit`, `debit`, and `settlement` entries per customer.
- **Reports & Charts** — Weekly payout trends, top customers by volume, and reconciliation accuracy stats (average delta, over/underpaid counts, error rate).
- **Offline-first** — Orders and customers created offline are queued in IndexedDB and synced when connectivity is restored via a service worker.
- **Role-based Access Control** — Attribute-based permissions for `admin` and `staff` roles across all resources.

## Tech Stack

| Layer         | Technology                                                              |
| ------------- | ----------------------------------------------------------------------- |
| Framework     | Next.js 16, React 19                                                    |
| Runtime       | Cloudflare Workers via [OpenNextJS](https://opennext.js.org/cloudflare) |
| Database      | Cloudflare D1 (SQLite) + Drizzle ORM                                    |
| Auth          | Better Auth (email/password, admin plugin)                              |
| UI            | shadcn/ui, Tailwind CSS, Recharts                                       |
| Data fetching | TanStack Query v5                                                       |
| Offline sync  | IndexedDB (`idb`) + service worker                                      |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) (`pnpm add -g wrangler`)

### Install

```bash
pnpm install
```

### Local Development

```bash
# Set up the local D1 database and apply migrations
pnpm db:migration:apply:local

# Start the Next.js dev server (hot reload, standard Node runtime)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

> **Note:** Some Cloudflare-specific features (D1 bindings, Workers KV, etc.) only work correctly on the Workers runtime. Use `pnpm preview` to test those.

### Preview on Cloudflare Runtime

```bash
pnpm preview
```

Builds the app with OpenNextJS and runs it locally on the Cloudflare Workers runtime.

## Commands

```bash
# Development
pnpm dev                              # Next.js dev server
pnpm preview                          # Build + run on Cloudflare Workers runtime locally

# Build & Deploy
pnpm build                            # Production Next.js build
pnpm deploy:dev                       # Deploy to Cloudflare (development env)
pnpm deploy:prod                      # Deploy to Cloudflare (production env)

# Database
pnpm db:migration:generate            # Generate Drizzle migrations from schema changes
pnpm db:migration:apply:local         # Apply migrations to local D1 database
pnpm db:migration:apply:dev           # Apply migrations to remote development D1
pnpm db:migration:apply:prod          # Apply migrations to remote production D1
pnpm db:studio:local                  # Open Drizzle Studio for local DB inspection
pnpm db:reset:local                   # Wipe local D1 state (destructive)

# Auth
pnpm auth:schema:generate             # Regenerate Better Auth schema (run after auth config changes)

# Cloudflare
pnpm cf-typegen                       # Regenerate cloudflare-env.d.ts from wrangler.jsonc bindings

# Code Quality
pnpm lint                             # Run ESLint
pnpm typecheck                        # TypeScript type check (no emit)
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/          # Login, sign-up, pending screens
│   ├── (dashboard)/     # Authenticated app routes
│   │   ├── customers/
│   │   ├── new-order/
│   │   ├── ledger/
│   │   ├── reconciliation/
│   │   ├── reports/
│   │   └── settings/
│   └── api/             # Route handlers (REST API)
├── components/
│   ├── dashboard/       # Shell, sidebar, topbar, session guard
│   └── ui/              # shadcn/ui components
├── lib/
│   ├── auth.ts          # Better Auth server instance
│   ├── db/              # Drizzle schemas and DB client
│   └── abac/            # Attribute-based access control helpers
└── services/
    ├── customers/        # Customer data access layer
    ├── orders/           # Order data access layer
    ├── ledger/           # Ledger data access layer
    ├── valuation/        # Valuation + ledger queries
    ├── reports/          # Reporting queries
    └── sync/             # Offline-first IndexedDB sync
```

## Domain Model

```text
Customer
  └─ ledgerBalance       Running credit/arrears balance

Order  (gold intake)
  ├─ status: pending → reconciled
  ├─ weightGrams, estimatedRate, estimatedValue
  ├─ ledgerAdjustment    Credit/arrear applied at intake
  └─ amountPaid          estimatedValue + ledgerAdjustment

Valuation  (1:1 with Order, set on Thursday)
  └─ delta               trueValue − estimatedValue

LedgerEntry  (append-only)
  └─ type: payout | credit | debit | settlement
```

## Environment Variables

Cloudflare bindings (`DB`, `IMAGES`, `ASSETS`) are configured in `wrangler.jsonc` and typed via auto-generated `cloudflare-env.d.ts`. Application-level secrets are parsed in `src/lib/get-env.ts`.

Copy `.dev.vars.example` (if present) to `.dev.vars` for local Wrangler secrets.

## Deploy

Deploy the application to Cloudflare:

```bash
npm run deploy
# or similar package manager command
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
