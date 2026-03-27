# server

Hono API server running on Cloudflare Workers with D1 (SQLite) for storage and Clerk for auth.

## Getting Started

```bash
# Install dependencies (from repo root)
pnpm install

# Generate types and Prisma client
pnpm run codegen

# Start the dev server (runs on http://localhost:8787)
pnpm run dev
```

The dev server uses a **local D1 database** by default — a SQLite file stored in `.wrangler/state/v3/d1/`. No remote database is touched during local development.

## Local D1 Database

### Applying migrations

After cloning or pulling new migration files, apply them locally:

```bash
pnpm wrangler d1 migrations apply season-sprint-dev --local
```

### Checking migration status

```bash
pnpm wrangler d1 migrations list season-sprint-dev --local
```

### Querying the local database

```bash
pnpm wrangler d1 execute season-sprint-dev --local --command "SELECT * FROM User;"
pnpm wrangler d1 execute season-sprint-dev --local --command "SELECT * FROM Record;"
```

### Resetting the local database

Delete the local SQLite file and re-apply migrations from scratch:

```bash
rm -rf .wrangler/state/v3/d1
pnpm wrangler d1 migrations apply season-sprint-dev --local
```

### Testing the API locally

The dev server accepts a `DEV_AUTH_TOKEN` header to bypass Clerk auth:

```bash
# Health check
curl http://localhost:8787/

# Get records
curl -H "Authorization: secret_dev_key" http://localhost:8787/me/records

# Upsert a record
curl -H "Authorization: secret_dev_key" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:8787/me/records \
     -d '{"date":"2026-03-27","winPoints":100}'
```

## Creating a Database Migration

Modify `prisma/schema.prisma`, then:

```bash
# 1. Create the migration file
pnpm wrangler d1 migrations create season-sprint-dev the_migration_name

# 2. Generate the SQL diff
pnpm prisma migrate diff \
    --from-url="file:.wrangler/state/v3/d1/miniflare-D1DatabaseObject/the_file_name.sqlite" \
    --to-schema-datamodel ./prisma/schema.prisma \
    --script \
    --output migrations/NNNN_the_migration_name.sql

# 3. Apply locally
pnpm wrangler d1 migrations apply season-sprint-dev --local

# 4. Apply to production (when ready)
pnpm wrangler d1 migrations apply season-sprint-dev --remote
```

## Deployment

```bash
pnpm run deploy
```

This runs codegen and deploys to Cloudflare Workers. Production env vars (Clerk keys, etc.) should be set in the Cloudflare dashboard under Workers > Settings > Variables.
