# Upstream

Redemptia is an independent product built from the [elmohq/elmo](https://github.com/elmohq/elmo) codebase (MIT).
elmo is tracked as a read-only `upstream` remote, and this file records every intentional divergence from it.

## Divergences

| Change | Upstream files touched | Why we diverge |
|---|---|---|
| The org daily run ceiling counts only the scraper's own usage events (`SCRAPER_USAGE_EVENT_TYPES`: `prompt_run`, `prompt_run_failed`) instead of every `usage_events` row. | `apps/worker/src/jobs/process-prompt.ts` (`isOrgOverDailyCeiling` moved out; import added), `packages/lib/src/db/schema.ts`, `packages/lib/package.json` | `usage_events` will also carry enrichment events, which must not use up the scraper's runaway-spend budget. The function's own stated meaning is "provider attempts", which enrichment events are not. Upstream counts all rows on purpose ("the stronger meaning for a safety ceiling"); this is a deliberate change, not a bug fix. |
| `isOrgOverDailyCeiling` lives in `packages/lib/src/usage/ceiling.ts` (export `@workspace/lib/usage/ceiling`). | same as above | This follows upstream's own direction: 7ffdb922 ("Share provider scaffolding and mention analysis in lib", #701) moved worker logic into `packages/lib` with tests. Enrichment needs its own ceiling computed outside process-prompt ([#9](https://github.com/redemptia/redemptia/issues/9)), and this module is where it goes. It also lets the `apps/web` integration project test the query, since `apps/worker` has no test harness. |
| Composite index `usage_events_org_type_created_idx` on `(organization_id, event_type, created_at)`, in migration `0100_usage_events_org_type_created_idx`. The existing `usage_events_org_created_idx` is kept. | `packages/lib/src/db/migrations/` | Keeps the filtered count cheap. Our migrations start at `0100` so they can't share a number with upstream's (at `0023` when this was written). |

**Open follow-up:** after the ceiling change, nothing caps enrichment spend. Enrichment must get its own independent ceiling before it writes its first `usage_events` row ([#9](https://github.com/redemptia/redemptia/issues/9)).

## Cherry-picking upstream

When an upstream change touches `apps/worker/src/jobs/process-prompt.ts`:

- **Changes to `isOrgOverDailyCeiling` or its docblock.** Apply them to `packages/lib/src/usage/ceiling.ts` instead, and keep the `event_type` filter.
- **A new `eventType` in `recordUsageEvent`.** Decide whether it is a scraper provider attempt. If it is, add it to `SCRAPER_USAGE_EVENT_TYPES`; if not, it needs its own ceiling (see #9).
- **Changes to how the ceiling is called** (the `dailyRunCeiling` check, the `org-daily-ceiling` Sentry tag, or the skip-and-reschedule behaviour). These merge as usual; only the function's location and filter differ from upstream.

When an upstream change adds a migration:

- **It will collide in `meta/_journal.json`.** Upstream's next entry is `idx` 24, which our `0100` entry already holds. Renumber the `idx` values so the journal stays sequential, and keep each file's original tag.
- **Its `when` timestamp must be later than our newest migration's.** drizzle's migrator skips, without any error, a migration whose `when` is older than the last one applied. An upstream migration generated before our `0100` therefore never runs on databases that already applied `0100`. Regenerate or re-timestamp it so it applies.
