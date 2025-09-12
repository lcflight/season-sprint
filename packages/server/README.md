# server

## Make a Database Migration

Modify your prisma/schema.prisma file, then:

```bash
pnpm wrangler d1 migrations create season-sprint-dev the_migration_name
pnpm prisma migrate diff \
    --from-url="file:.wrangler/state/v3/d1/miniflare-D1DataqbaseObject/the_file_name.sqlite" \
    --to-schema-datamodel ./prisma/schema.prisma \
    --script \
    --output migrations/1234_the_migration_name.sql
pnpm wrangler d1 migrations apply season-sprint-dev --local
pnpm wrangler d1 migrations apply season-sprint-dev --remote
```
