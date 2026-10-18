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

## Mention and sentiment judging
Mentions and sentiment are judged by Jev (TypeSafe), with `TYPESAFE_API_KEY`.
The worker refuses to start without it. `TYPESAFE_API_KEY=stub` judges from cue
words and calls no one; use it for every local run, test and CI job. Stub
judgements are stamped as the stub's, so switching a database from `stub` to a
real key re-judges what the stub judged. A real key
spends on every answer that names a tracked company (no spend ceiling exists in
code), and the worker spends on its own: each start re-requests judging for the
last 30 days of unjudged runs, and history is reprocessed back `REPROCESS_DAYS`
(default 90) whenever the judge, the extractor or a brand's names or
competitors change. Setting a real key anywhere is a separate, explicit
decision, and nothing caps the spend yet ([#85](https://github.com/redemptia/redemptia/issues/85)). Until runs are judged, the Sentiment page is empty.

## Shared context

Facts and rules established across PRs, kept here so they reach whoever opens this repo. If you find one contradicted by the source, stop and say so before acting on it.

### Execution
- **Mutation proofs run scoped tests**, just the file that covers the code. The full gate runs once per PR, right before push.
- **About four mutations per PR is enough**, chosen at the invariant's boundary rather than enumerated. A race or lock mutation runs 3–5 times, since one pass can go green by luck; the repeats count as one.
- **Report failures only**, from a dot or summary reporter.
- **Run the post-merge gate once per batch of merges.** CI already gated each merge.
- **Compare index shapes on a slice** (~50k runs) to pick a winner. Then measure the winner at realistic volume before quoting a number: a slice misleads on partial indexes and on plans that flip to a seq scan with volume.

### The gate (before every push)
`pnpm lint && pnpm turbo check-types test`, then each integration suite with `TEST_DATABASE_URL` pointing at a database whose name ends in `_test`, one package at a time as `build.yaml` runs them (the lib suite truncates tables the others write to): `pnpm -C apps/web test:integration`, `pnpm -C apps/worker test:integration`, `pnpm -C packages/lib test:integration`.
- **Baseline:** 1,521 unit tests (config 114, cli 32, deployment 52, lib 697, worker 66, web 560) and 116 integration tests (web 56, worker 34, lib 26), all green, no expected failures. A fresh `_test` database applies 31 migrations.
- **CI** runs 7 checks on every PR (Build, Dependency License Audit, E2E Integration Tests, Scheduling Policy Verification, smoke, Vercel, Vercel Preview Comments), plus Install when `skills/` or its workflow changes. Read the list on the PR rather than trusting a count.
- **CI sets no `DEPLOYMENT_MODE`.** An integration test that reaches deployment or entitlement code (`getDeploymentFeatures`, `getOrgEntitlements`) must `vi.stubEnv("DEPLOYMENT_MODE", …)`, and before anything it starts (the worker creates some pg-boss queues, such as `generate-report`, only when a deployment feature is on). A local `.env` hides the failure, so it shows up only in CI. To reproduce one, move both `.env` files aside and run the file alone against a fresh `_test` database: another file can create shared state, such as a queue, that masks it.
- **Known flaky tests:**
  - `e2e/tests/shared/api-keys.spec.ts` (brand multi-select vs the Create click) and `e2e/tests/shared/overview.spec.ts` (sidebar links) can flake. `failOnFlakyTests` makes a flake red.
  - Re-run once. If it recurs, fix it: it may be an app bug.

### Stop and ask before
- anything that would spend money on an LLM or provider call;
- a user-visible change you didn't expect;
- three CI failures from one cause;
- acting on a contradicted fact below.

### Facts
- **Five names are never renamed.** Renaming any of them breaks live deployments or splits a lock:
  - `ELMO_ENCRYPTION_KEY` (and its rotation sibling `ELMO_ENCRYPTION_KEY_OLD`) is the env var every deployment's stored secrets are encrypted under.
  - The `x-elmo-*` OpenAPI extensions (`x-elmo-scopes`, `x-elmo-admin-only`) are part of the published spec; the route-conformance test and the Bruno suite read them.
  - These three are every advisory-lock key in the tree. A rename on a running deployment means old and new processes take *different* locks and each believes it holds the lock, so the work runs concurrently instead of failing:
    - `QUOTA_LOCK_CLASS` (`0x656c6d6f`, "elmo" in hex), the class `withQuotaLock` takes (`packages/lib/src/entitlements/guards.ts`);
    - `'redemptia-user-memberships'`, the per-user membership sync lock (`packages/lib/src/db/auth-sync.ts`);
    - `'redemptia-rollups'`, the per-brand rollup rebuild lock (`packages/lib/src/rollups/rebuild.ts`).

    A new advisory lock joins this list in the PR that adds it.
- **Tenancy is application code only.** RLS is inert: the tables call `.enableRLS()` with no policies, and the app connects as table owner.
  - Cross-brand list cores (`listPrompts`, `listCompetitors`, `listBrands`) take `scope: SQL | undefined` as a required key (#23).
  - Brand-scoped analytics cores take a brand id the edge has already gated.
  - Dashboard server functions gate with `requireBrandSession`, and that gate has no test (#21).
- **Migrations (drizzle 0.45.2).** The only gate is the journal `when` against the newest applied migration; filenames and `idx` don't matter, and skipped migrations are silent.
  - We are on elmo's 0000–0030 and have none of our own; the next is 0031, which is also elmo's next. Follow the procedure in UPSTREAM.md before adding one or merging elmo's.
  - Everything runs in one transaction, so no `CREATE INDEX CONCURRENTLY`.
  - Never run `drizzle-kit push`.
- **Four raw-SQL indexes on `prompt_runs` are invisible to drizzle and the drift check:** `idx_prompt_runs_brand_analytics`, `idx_prompt_runs_prompt_analytics`, `idx_prompt_runs_admin` (0003), `prompt_runs_web_search_model_group_created_at_idx` (0000). Don't duplicate them. Drizzle 0.45 can't express `INCLUDE`.
- **`prompt_runs` is append-only.** A trigger (0024) rejects updates; derived data lives in `run_extractions`, `run_mentions` and `citations`.
- **Competitor names and ids.**
  - `run_mentions.competitors_mentioned` stores names, not ids, and the rollups are keyed by `competitor_name`.
  - Saving a brand's competitor list from the dashboard deletes and re-inserts it, so every save mints new ids; the API PATCH keeps the id (#24).
  - Nothing makes competitor names unique per brand, in any case (#78).
- **Mention matching is case-insensitive and whole-word** (`wholeWordPattern` in `packages/lib/src/mentions.ts`), but the judge sees names as written: recasing or renaming a brand or competitor changes its `subjectFingerprint` and re-judges that subject's history, which is paid.
- **No deployment is guaranteed a usable LLM.** Conditional registration uses `getDeploymentFeatures()`.
  - `withQuotaLock` holds a transaction and a per-org advisory lock. No LLM call may happen inside it.
- **pg-boss queues.**
  - `singletonKey` uniqueness is state-scoped. Paid-work idempotency must be a database uniqueness constraint.
  - pg-boss `priority` only orders jobs within one queue.
- **Demo mode's `readOnly` is HTTP-only.**
- **`analytics-core.ts` feeds the dashboard, REST and MCP.**
- **`openapi.json` is hand-maintained.** A new v1 route needs it updated, then `pnpm lint:spec`. The SDK generator (`hey-api.config.json`) reads it too.
- **Entitlement flags live in code.** `entitlementOverridesSchema` is `.strict()`, and a parse failure drops the whole payload, so ship a schema key before any data that uses it.

### Known gaps
- #85: Jev judging has no spend cap; fix it before any real `TYPESAFE_API_KEY` is set.
- #78: competitor names aren't unique per brand, and a dashboard save re-creates the list.
- #80: the cookie banner asks for an Advertising category nothing reads; `packages/ui/src/lib/idle.ts` is unused.
- #21: `requireBrandSession` has no test.
- #24: a dashboard competitor rename mints a new id; the API rename keeps it.
- #83: the CLI's Docker Hub images don't exist, and `@redemptia/cli@0.4.4` predates the `TYPESAFE_API_KEY` prompt.
- #18 is obsolete (the backfill it was about is deleted) and closes with the sentiment issues.
