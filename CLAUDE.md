@AGENTS.md

## Working agreement

These bind every change in this repo, in addition to AGENTS.md.

- **One concern per PR.** Branch from a fresh `main`, and merge before starting the next PR.
- **Never merge red CI.** Read each check's conclusion before merging; "finished" is not "passed".
- **V1 rigor.** One self-review per PR plus CI. No second adversarial reviewer and no large-scale benchmarks, unless the PR touches money or can corrupt data.
- **Revert-prove only tests guarding money, data integrity or tenancy.** For those, revert the fix, show the test fails, restore it, and put that proof in the PR. Ordinary tests just need to pass. A test that passes whether or not the code is right is worse than none: delete it or make it bite.
- **Known gaps are written down, not fixed.** Anything that isn't money, data loss or a tenancy leak goes into a GitHub issue.
- **The PR budget is hard.** When a phase's budget is spent, ship what exists, record what's left, and stop and report.
- **Verify, don't assume.** Find code by name, not line number, because line numbers drift. Never cite a file or behaviour you haven't opened. If a claim can't be checked against the source, say "cannot verify".
- **Investigate, then propose, before coding a design call.** Lay out the options and their honest costs, recommend one, and stop for a decision.
- **Caveats go first.** In any report or PR body they come at the top, and anything that should block a merge is the first line.
- **No speculative code.** Don't build for a consumer that doesn't exist yet. File findings as GitHub issues instead.

## SCRAPE_TARGETS (production)
Engines: openai-api, searchapi
(Decided pre-deploy, 2026-10-13. Still pre-launch — no production
SCRAPE_TARGETS env value exists yet. This is the intended pair; the
actual env var gets set at deploy time and must match this line, or
this line gets updated to match it.)
Issue #18 does not apply: none of these are Mistral web search,
DataForSEO LLM Scraper or BrightData chatbot datasets — the only
providers whose answer text diverges between the live extractor and the
run_texts backfill. Every run in this mix gets real answer text, so
NULL-text runs here mean genuine blank answers or extraction failure,
not provider divergence.

## Sentiment analyzer (decided 2026-10-13)
Provider: openai-api. Model: gpt-5-mini (env SENTIMENT_MODEL).
Hard enrichment spend ceiling: $2 per organization per day.
This is separate from SCRAPE_TARGETS: scrape targets decide what text we
capture, the analyzer decides what scores it.

## Shared context

Facts and rules established across PRs, kept here so they reach whoever opens this repo. If you find one contradicted by the source, stop and say so before acting on it.

### Execution
- **Mutation proofs run scoped tests**, just the file that covers the code. The full gate runs once per PR, right before push.
- **About four mutations per PR is enough**, chosen at the invariant's boundary rather than enumerated. A race or lock mutation runs 3–5 times, since one pass can go green by luck; the repeats count as one.
- **Report failures only**, from a dot or summary reporter.
- **Run the post-merge gate once per batch of merges.** CI already gated each merge.
- **Compare index shapes on a slice** (~50k runs) to pick a winner. Then measure the winner at realistic volume before quoting a number: a slice misleads on partial indexes and on plans that flip to a seq scan with volume.

### The gate (before every push)
`pnpm lint && pnpm turbo check-types test`, then `pnpm -C apps/web test:integration` with `TEST_DATABASE_URL` pointing at a database whose name ends in `_test`.
- **Baseline:** 1,472 unit tests plus 4 expected failures, and 150 integration tests, all green.
- **CI** is 5 checks.
- **CI sets no `DEPLOYMENT_MODE`.** An integration test that reaches deployment or entitlement code (`getDeploymentFeatures`, `getOrgEntitlements`) must `vi.stubEnv("DEPLOYMENT_MODE", …)`, and before anything it starts (pg-boss creates the recompute queue only if enrichment is on when it starts). A local `.env` hides the failure, so it shows up only in CI. To reproduce one, move both `.env` files aside and run the file alone against a fresh `_test` database: another file can create shared state, such as a queue, that masks it.
- **Known flaky tests:**
  - `e2e/tests/shared/api-keys.spec.ts` (brand multi-select vs the Create click) and `e2e/tests/shared/overview.spec.ts` (sidebar links) can flake. `failOnFlakyTests` makes a flake red.
  - Re-run once. If it recurs, fix it: it may be an app bug.

### Stop and ask before
- anything that would spend money on an LLM or provider call;
- a user-visible change you didn't expect;
- three CI failures from one cause;
- acting on a contradicted fact below.

### Facts
- **Three elmo names are never renamed.** Renaming any of them breaks live deployments or drops the lock:
  - `ELMO_ENCRYPTION_KEY` (and its rotation sibling `ELMO_ENCRYPTION_KEY_OLD`) is the env var every deployment's stored secrets are encrypted under.
  - The `x-elmo-*` OpenAPI extensions (`x-elmo-scopes`, `x-elmo-admin-only`) are part of the published spec; the route-conformance test and the Bruno suite read them.
  - `QUOTA_LOCK_CLASS` (`0x656c6d6f`, "elmo" in hex) is the advisory-lock class `withQuotaLock` takes; every process must use the same value.
- **Tenancy is application code only.** RLS is inert: the tables call `.enableRLS()` with no policies, and the app connects as table owner.
  - Cross-brand list cores (`listPrompts`, `listCompetitors`, `listBrands`) take `scope: SQL | undefined` as a required key (#23).
  - Brand-scoped analytics cores take a brand id the edge has already gated.
  - Dashboard server functions gate with `requireBrandSession`, and that gate has no test (#21).
- **Migrations (drizzle 0.45.2).** The only gate is the journal `when` against the newest applied migration; filenames and `idx` don't matter, and skipped migrations are silent.
  - Ours are 0100–0107; the next is 0108. Upstream is at 0023.
  - Everything runs in one transaction, so no `CREATE INDEX CONCURRENTLY`.
  - Never run `drizzle-kit push`.
- **Four raw-SQL indexes on `prompt_runs` are invisible to drizzle and the drift check:** `idx_prompt_runs_brand_analytics`, `idx_prompt_runs_prompt_analytics`, `idx_prompt_runs_admin`, `prompt_runs_web_search_model_group_created_at_idx`. Don't duplicate them. Drizzle 0.45 can't express `INCLUDE`.
- **`run_texts`** holds one row per run: text (NULL when extraction produced no answer, or hit one of `EXTRACTION_SENTINELS`), `content_hash`, `answer_length`, `extractor_version`, and `source` (`live` or `backfill`).
- **Mention analysis lives in two tables:**
  - `run_subject_mentions`, sparse: one row per run × mentioned subject, storing only `first_offset` and `position`;
  - `run_mention_analyses`, one marker per run.

  A run is not analysed when its marker is missing or stale (`isStale` in `packages/lib/src/enrichment/reconcile.ts`). The exception: a run whose text is NULL is currently marked analysed with no mentions (#36).
- **`packages/lib/src/mentions.ts`** is pure: `locateSubject` gives positions, and `mentionsSubject` is defined through it.
- **Competitor names and ids.**
  - `prompt_runs.competitors_mentioned` stores names, not ids.
  - Competitor ids survive saves that don't rename. A dashboard rename gives the competitor a new id, while the API PATCH keeps it (#24).
  - Stored mention analysis is re-derived from text under the current names, so a rename re-matches history to the new name whichever path made it.
- **Matching is case-insensitive** but the competitors unique constraint isn't (#12).
- **No deployment is guaranteed a usable LLM.** Conditional registration uses `getDeploymentFeatures()`.
  - `withQuotaLock` holds a transaction and a per-org advisory lock. No LLM call may happen inside it.
  - Writers of a brand's mention analysis serialise on `lockBrandAnalysis`. Brand and competitor edits don't take that lock.
- **pg-boss queues.**
  - `singletonKey` uniqueness is state-scoped. Paid-work idempotency must be a database uniqueness constraint.
  - pg-boss `priority` only orders jobs within one queue.
  - The mention recompute queue uses the `stately` policy.
- **Demo mode's `readOnly` is HTTP-only.**
- **`analytics-core.ts` feeds the dashboard, REST and MCP.**
- **`openapi.json` is hand-maintained.** A new v1 route needs it updated, then `pnpm lint:spec`.
- **Entitlement flags live in code.** `entitlementOverridesSchema` is `.strict()`, and a parse failure drops the whole payload, so ship a schema key before any data that uses it.
- **Enrichment has no spend ceiling of its own (#9).** Phase 1 is zero-spend by construction.
