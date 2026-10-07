# Upstream

Redemptia is an independent product built from the [elmohq/elmo](https://github.com/elmohq/elmo) codebase (MIT).
elmo is tracked as a read-only `upstream` remote, and this file records every intentional divergence from it.

## Divergences

| Change | Upstream files touched | Why we diverge |
|---|---|---|
| The org daily run ceiling counts only the scraper's own usage events (`SCRAPER_USAGE_EVENT_TYPES`: `prompt_run`, `prompt_run_failed`) instead of every `usage_events` row. | `apps/worker/src/jobs/process-prompt.ts` (`isOrgOverDailyCeiling` moved out; import added), `packages/lib/src/db/schema.ts`, `packages/lib/package.json` | `usage_events` will also carry enrichment events, which must not use up the scraper's runaway-spend budget. The function's own stated meaning is "provider attempts", which enrichment events are not. Upstream counts all rows on purpose ("the stronger meaning for a safety ceiling"); this is a deliberate change, not a bug fix. |
| `isOrgOverDailyCeiling` lives in `packages/lib/src/usage/ceiling.ts` (export `@workspace/lib/usage/ceiling`). | same as above | This follows upstream's own direction: 7ffdb922 ("Share provider scaffolding and mention analysis in lib", #701) moved worker logic into `packages/lib` with tests. Enrichment needs its own ceiling computed outside process-prompt ([#9](https://github.com/redemptia/redemptia/issues/9)), and this module is where it goes. It also lets the `apps/web` integration project test the query, since `apps/worker` has no test harness. |
| Composite index `usage_events_org_type_created_idx` on `(organization_id, event_type, created_at)`, in migration `0100_usage_events_org_type_created_idx`. The existing `usage_events_org_created_idx` is kept. | `packages/lib/src/db/migrations/` | Keeps the filtered count cheap. Takes a write-blocking lock while it builds; see [Migrations](#migrations). |
| The database pool size is set explicitly, from the optional `DATABASE_POOL_MAX` (default `10`, node-postgres's own default, so leaving it unset changes nothing). | `packages/lib/src/db/db.ts` (upstream-owned; it used to pass only the URL), `packages/config/src/env-registry.ts`, `turbo.json`, `apps/web/src/env.d.ts`, `packages/docs/content/docs/developer-guide/configuration.mdx` | Upstream leaves the pool at the driver default with no way to change it. The worker alone can run about 16 handlers against those 10 connections, so the size needs to be visible and tunable. It's per process, though: anyone raising it has to multiply by the process count against Postgres's `max_connections` (the arithmetic is in the comment in `db.ts`). |
| Saving a brand's competitor list keeps the id of every competitor whose name is unchanged. It deletes only the names that left the list, updates domains and aliases in place, and inserts new names. Upstream deletes every competitor and re-inserts the whole list. This is backed by a unique constraint on `competitors(brand_id, name)` (migration `0101_competitors_brand_id_name_unique`, which first de-duplicates, keeping the oldest row). The other write paths now report a taken name instead of creating a duplicate: API POST and PATCH return 409, add-from-domain throws, and onboarding skips the name. | `apps/web/src/server/brands.ts` (upstream-owned; `updateCompetitors` now calls `setBrandCompetitors` in `apps/web/src/server/competitors-core.ts`), `apps/web/src/server/onboarding-core.ts`, `apps/web/src/routes/api/v1/competitors/index.ts`, `apps/web/src/routes/api/v1/competitors/$competitorId.ts`, `packages/lib/src/db/schema.ts`, `packages/lib/src/db/unique-names.ts` | Upstream's delete-and-reinsert gives every competitor a new id on every routine save, which would orphan any history keyed on competitor id. Names have to be unique for a save to know which stored row each one is. The constraint is case-sensitive for now; it should probably ignore case and surrounding whitespace ([#12](https://github.com/redemptia/redemptia/issues/12)). |

**`DATABASE_URL` unset (from the pool-size change).** `db.ts` now builds a pool even when `DATABASE_URL` is unset; upstream built none. A query then tries pg's defaults (localhost) instead of failing on an undefined client. Nothing stops a web process from starting without it either: `assertRequiredEnv` is only called from `apps/worker/src/index.ts`. The web app only checks per request, rendering the missing-env page from `getEnvValidationState`, while its server functions and API routes keep running against that pool.

**Open follow-up:** after the ceiling change, nothing caps enrichment spend. Enrichment must get its own independent ceiling before it writes its first `usage_events` row ([#9](https://github.com/redemptia/redemptia/issues/9)).

## Cherry-picking upstream

When an upstream change touches `apps/worker/src/jobs/process-prompt.ts`:

- **Changes to `isOrgOverDailyCeiling` or its docblock.** Apply them to `packages/lib/src/usage/ceiling.ts` instead, and keep the `event_type` filter.
- **A new `eventType` in `recordUsageEvent`.** Decide whether it is a scraper provider attempt. If it is, add it to `SCRAPER_USAGE_EVENT_TYPES`; if not, it needs its own ceiling (see #9).
- **Changes to how the ceiling is called** (the `dailyRunCeiling` check, the `org-daily-ceiling` Sentry tag, or the skip-and-reschedule behaviour). These merge as usual; only the function's location and filter differ from upstream.

## Migrations

Our migrations are numbered from `0100` (upstream was at `0023` when we started). The number is only a human-readable marker of which migrations are ours. It does **not** prevent collisions or skipped migrations, because drizzle's migrator ignores filenames and journal `idx`. It applies a migration only if its journal `when` is newer than the newest migration the database has already applied, and skips the rest with no error or warning.

**Rule:** when cherry-picking **any** upstream migration, rewrite its `when` in `meta/_journal.json` to the current epoch milliseconds before applying it. Otherwise drizzle silently skips it and the schema drifts. Keep the SQL unchanged; only the timestamp moves.

- **An `idx` collision with upstream** shows up as a git conflict in `_journal.json`. That's the loud failure we want. Resolve it by renumbering our entry and bumping its `when`.
- **CI** (`build.yaml`, "Migrations apply on upgrade from the base commit") upgrades a scratch database from the base commit's migrations to the branch's. It fails if any journal entry didn't apply. This is the only check that catches a silently skipped migration.

**Index builds lock writes.** `0100_usage_events_org_type_created_idx` blocks writes to `usage_events` while the index builds. drizzle runs every migration in one transaction, so `CREATE INDEX CONCURRENTLY` isn't possible through it. That's acceptable while there are no production users. If `usage_events` is ever large, use this escape hatch for this or any similar index migration:

1. Build the index by hand, outside drizzle: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...`, with the same statement as the migration file.
2. Mark the migration applied: `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256 hex of the .sql file>', <its journal when>);`
3. Run the migrator as usual. The recorded `created_at` equals the migration's `when`, so it skips the migration.
