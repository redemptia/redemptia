# Redemptia — Sentiment & Demand: Handoff from Phase 2 to the End

**How to use this:** commit it to the repo as `docs/HANDOFF-PHASE-2.md`, then paste the prompt in §8 into Claude Code once. Everything it needs is in this file, `CLAUDE.md`, `UPSTREAM.md` and `docs/PHASE-1-REVIEW.md`.

**State at handoff:** `main` = `25e0ffc`. Phases 0.5 and 1 are done. The pre-Phase-2 hardening pass was **not** done, and is deliberately replaced by the lighter plan below.

---

## 1. The rules from here on (lighter, on purpose)

Phases 0.5 and 1 ran at the rigor of a team with paying customers. Redemptia has none yet. From now on:

1. **V1 rigor, not audit rigor.** One self-review per PR plus CI. No second adversarial reviewer, no 504k-row benchmarks, unless a PR touches money or can corrupt data.
2. **Revert-prove only what can cost money or corrupt data.** Spend ceilings, idempotency, tenancy on new reads, anything that writes paid results. Ordinary tests just need to pass.
3. **Known gaps are written down, not fixed.** If it isn't money, data loss, or a tenancy leak, it goes in §5 or an issue and waits for a real user to hit it.
4. **Every phase has a PR budget.** When the budget is spent, ship what exists and record what's left. Don't extend the budget without asking.

**Rules that do NOT get lighter:**
- **Never merge red CI.** Read the check conclusions; "checks finished" ≠ "checks passed". (#42 went in red.)
- **No LLM call merges before the enrichment spend ceiling (#9).** #10 removed enrichment from the scraper's ceiling, so today nothing caps it.
- **Never run `drizzle-kit push`.** Migrations only. Next migration number is **`0105`**.
- **One concern per PR**, branch off fresh `main`, merge before starting the next.
- **Ship an entitlement schema key before writing any data that uses it** (a `.strict()` parse failure drops a custom org to `NO_PLAN_ENTITLEMENTS` and stops tracking).

---

## 2. Before anything — you, ~10 minutes

1. **Turn on branch protection** (GitHub → Settings → Branches → rule for `main`): require status checks *Build, E2E Integration Tests, Scheduling Policy Verification, smoke, Dependency License Audit*, and require branches up to date.
2. **Decide your production `SCRAPE_TARGETS`.** Which engines/providers will Redemptia actually run? This decides whether issue #18 matters: if it includes **Mistral web search**, **DataForSEO LLM Scraper** or **BrightData chatbot datasets**, those runs have no answer text and get no sentiment. Write the answer into `CLAUDE.md`.
3. **Delete two inherited workflows** (or let Claude Code do it as PR 0): `cla-check.yaml` (fails every PR you open — you're not in elmo's CLA registry, and shouldn't be) and `daily-blog-draft.yaml` (drafts posts for elmo's marketing site).

---

## 3. What's done

### Phase 0.5 — dependencies (8 PRs)

| PR | Result |
|---|---|
| #6, #8 | Stopped web app re-submitting **paid** fan-outs (pg-boss send options beat queue policy); unified prompt-job expiry |
| #10 | Scraper ceiling counts only scraper events → enrichment can't trip it. **Created `UPSTREAM.md`**, schema-drift + migration-upgrade CI checks |
| #11 | Explicit DB pool size (`DATABASE_POOL_MAX`, default 10) |
| #13 | Competitor UUIDs survive an unchanged save (`unique(brand_id, name)` + diff upsert) |
| #14, #17 | `run_texts`: persisted answer text, `content_hash`, `answer_length`, `extractor_version`, `source`; resumable backfill |
| #19 | Structured LLM calls take a `model` param; `modelVersion` reports the model actually used |
| #23 | Cross-tenant list functions require a `scope` key; two-tenant tests |

### Phase 1 — prominence & rank, $0 spend (10 PRs, #27–#39)

`locateSubject` (#27) → prominence/rank (#28) → `run_mention_analysis` tables, migration 0104 (#30) → analysis on save (#31) → backfill (#32) → recompute when subjects change (#33) → one read for dashboard + REST + MCP (#35) → Mentions page (#37) → worker metrics on admin Workflows page (#38) → e2e proof script (#39).

Key decisions: **stored**, not computed (measured 20–110× faster); code lives in **`packages/lib/src/enrichment/`** (no new package); enrichment has **its own low-concurrency queue** (pg-boss `priority` only orders within one queue); **not on in `demo`**.

Review (#42, `docs/PHASE-1-REVIEW.md`) scored it: correctness 3, tests 3, tenancy 3, performance 3, migrations 4, scope 4, **Phase 2 readiness 2**. The three things holding readiness down are handled in Phase 2 PR 1–2 below at the cheapest workable level.

---

## 4. Facts Phase 2+ depends on

- **Read path:** add metrics as one function in `apps/web/src/server/analytics-core.ts` → dashboard, `/api/v1` and MCP all get it. Reads are brand-scoped and gated at each edge (`requireBrandInScope` for REST/MCP, `requireBrandSession` for dashboard).
- **New v1 route:** must export all five verbs; **`packages/api-spec/src/openapi.json` is hand-edited** (no generator), then `pnpm lint:spec && pnpm test`.
- **LLM access:** `runStructuredCompletionPrompt(prompt, schema, { model })` in `packages/lib/src/onboarding/llm.ts`. Providers in preference order: `openai-api`, `openrouter` (both default to `gpt-5-mini`), `anthropic-api`, `mistral-api`.
- **No deployment is guaranteed an LLM** — the boot gate excludes provider keys. Enrichment must check availability and degrade (issue #25), never throw at the user.
- **`withQuotaLock`** holds a transaction + advisory lock. **No LLM call may ever run inside it.**
- **Idempotency for paid work = a DB unique constraint**, not `singletonKey` (pg-boss singletons only dedupe pending/active jobs).
- **`run_texts.text` is NULL** for blank answers, the 20 extraction sentinels, and the #18 divergent providers. Never send a NULL-text run to an LLM.
- **Competitor ids still change on a dashboard rename** (#24): the editor submits no ids, so rename = delete + add. Don't key paid results on competitor id alone (see Phase 2 PR 2).
- **Case variants** ("Acme"/"acme") are separate competitors but match the same text (#12). Normalise subject names with `lower(btrim(name))` in anything new.
- **Drizzle migrations** are gated only by the journal `when` timestamp and skip silently. When cherry-picking an upstream migration, set its `when` to now. CI's migration-upgrade check catches skips.

---

## 5. Known gaps — accepted, not fixed (unless a user hits them)

| Gap | Issue | Why it can wait |
|---|---|---|
| NULL-text runs shown as "analysed, 0 mentions" on the Mentions page | #36 | Display bug; Phase 2 excludes them from **spend** in PR 2. Fix the display if anyone notices |
| Rename re-matches history to the new name (3 runs → 1 in the demo) | #24 | Rare pre-launch. Cheap fix when needed: carry the old name into `aliases` on rename |
| Case-variant competitors double-count | #12 | Same — fix with a `lower(name)` unique index when it matters |
| Coverage drops to 0% for ~19 min after any subject edit (Business brand) | — | Per-subject fingerprints fix it; not needed at zero customers |
| Mentions read is 1.6–1.75 s, seq-scans, unused 90 MB index | #26 | Faster variant measured (0.87 s); do it when a real brand is slow |
| Only 1 of 9 recompute-enqueue paths tested; dashboard tenancy gate untested | #21 | Gate is correct today; add tests when touching those files |
| No retention on enrichment tables (~7.8 GB/customer/yr modelled) | #29 | Matters only with real volume |
| `rawOutput` readers, `raw_output::text` search scan | #15, #16 | Performance, not correctness |
| Extraction divergence for 3 provider paths | #18 | Only matters if §2.2 says you run those providers |
| `VerifiedBrandId` branded type; org-level billing guard | #20, #22 | Structural hardening; do if tenancy bugs recur |
| Flaky e2e: `overview.spec.ts`, `api-keys.spec.ts:25` | #43 | Re-run once; fix if it blocks twice in a week |
| Rebrand (~250 files still say elmo) | — | Deferred. Never rename `ELMO_ENCRYPTION_KEY`, `x-elmo-*`, or `QUOTA_LOCK_CLASS` casually |

---

## 6. The plan — Phase 2 to the end

### Phase 2 — Sentiment classifier, no UI (budget: 5 PRs)

The first phase that spends money. Goal: stance labels stored and measured; **no customer-facing UI yet**.

| PR | Work | Must prove (revert-test) |
|---|---|---|
| **1** | **#9 enrichment spend ceiling.** Per-org daily cap for enrichment events, independent of the scraper ceiling; record `usage_events` with `event_type` `sentiment-analysis`; widen the writer's event-type union. Use `packages/lib/src/usage/ceiling.ts` (the scraper ceiling already lives there). | Over-cap org is refused; scraper ceiling unaffected |
| **2** | **Stance storage + job.** Migration 0105. Judgement cache keyed on **`(content_hash, lower(btrim(subject_name)), analyzer_version)`** with a unique constraint — this one key gives you dedupe across replications, idempotent retries, survives competitor-id churn (#24), and normalises case (#12). Columns: `stance` (enum: recommended, mentioned_neutral, mentioned_caveated, disrecommended, comparison_anchor), `role`, `confidence`, `evidence` (10–30 word verbatim span), `analyzer_model`. Job selects only runs with **`text IS NOT NULL`** and at least one mentioned subject, batches by (prompt, model, day), calls `runStructuredCompletionPrompt` with an explicit model (`SENTIMENT_MODEL`, default `gpt-5-mini`), retries 2. Own queue, low concurrency, gated off in `demo`, no-op when no LLM is configured. Never inside `withQuotaLock`. | Unique key blocks a duplicate paid call; NULL-text run is never sent; ceiling stops the job |
| **3** | **Golden set + eval script.** ~100–150 hand-labelled excerpts covering all five stances incl. hard cases (comparison anchor, caveated, long lists). Script reports per-class agreement and **measured cost per call**. Not in PR CI (calls a real model); run manually. | — |
| **4** | **Tune prompt against the golden set**, then a **bounded backfill** with `--dry-run` (count + estimated cost, no spend) and a daily cap. | Dry run spends nothing |
| **5** | Buffer / fixes from 1–4. | — |

**Exit criteria (stop and report, don't build UI until both hold):**
- Agreement ≥ 85% overall and ≥ 90% on `disrecommended` (the expensive error).
- **Measured** enrichment cost ≤ 15% of plan price (≈ $15/mo at $99). This replaces the never-repriced $8/customer/month estimate.

**Stop and ask before:** the first real LLM call, any backfill that isn't a dry run.

### Phase 3 — Sentiment surfaces (budget: 4 PRs)

| PR | Work |
|---|---|
| **1** | Read: one `analytics-core.ts` function — stance mix, net stance rate `(recommended − disrecommended − comparison_anchor) / mentioned`, risk prompts, evidence. Filter to one `analyzer_version` (never mix versions in a chart). Exclude NULL-text runs from denominators. Tenancy test at the REST and MCP edges (revert-proved). |
| **2** | Sentiment tab on the brand page; **risk-prompt list as the default view**; evidence span shown with every label; "model analysis off" state when no LLM (#25). |
| **3** | `/api/v1/brands/{id}/sentiment` (5 verbs, hand-edit openapi) + MCP `get_sentiment` (read-only). |
| **4** | Entitlement: `sentimentAnalysis` flag. **PR order: schema key in `entitlementOverridesSchema` first, merged, then gating.** Starter gets prominence/rank only; Basic+ gets stance. |

### ✋ Checkpoint after Phase 3 — ship and get users

**Stop building here.** Sentiment is a complete, sellable feature. Phases 4–7 need data you don't have: real `webQueries`, real keyword match rates, real customers to calibrate against. Building them on synthetic data repeats the over-engineering trap. Resume only when you have at least a few real brands running on real `SCRAPE_TARGETS`.

### Phase 4 — Keyword plumbing (budget: 4 PRs) — *gated on real data*

**Gate first (one SQL query, no code):** run the fan-out coverage query from Part 6 of `claude/Sentiment Compatibility Analysis.md` on production data. If real query strings exist on fewer than ~40% of runs for your targets, the fan-out approach is weak — reconsider before building.

Then: `keyword_volumes` cache table **with no `organization_id`** (deliberately cross-tenant — comment why), a small `KeywordProvider` interface (not an extension of `Provider`), one adapter (DataForSEO is already integrated), monthly refresh cron. Measure cache hit rate and match rate before any UI.

### Phase 5 — Demand surfaces (budget: 3 PRs)

`prompt_demand` table (append-only, monthly rows, `estimator_version`, `evidence` jsonb). Show the **0–100 demand index within the brand's own prompts** as the headline, the log-scale band as detail, and "not enough data" instead of a low number when confidence is low. API field name `searchDemandIndex`, never `promptVolume`.

### Phase 6 — Priority worklist (budget: 3 PRs)

Composite of demand × (1 − citation stability) × visibility gap, with sentiment as a separate **Grow / Defend / Fix** flag, not a term in the score. Weights in one exported constant. MCP `get_priorities`.

### Phase 7 — Calibration (only with paying Business customers)

Google Search Console integration; tune the demand coefficient against real impression ordering (rank correlation, not absolute error). Publish the golden-set agreement rate and method.

---

## 7. Gate (run before every push)

```
pnpm lint && pnpm turbo check-types test
TEST_DATABASE_URL=postgres://janpallysusheel@localhost:5432/redemptia_test pnpm -C apps/web test:integration
```

Env: macOS, Node 24 via nvm, pnpm 12.4.1, Homebrew Postgres 17 (`redemptia`, `redemptia_test`, user `janpallysusheel`, no password). After a merge: `git checkout main && git pull`.

---

## 8. The one prompt to paste into Claude Code

```
Read docs/HANDOFF-PHASE-2.md, CLAUDE.md, UPSTREAM.md and
docs/PHASE-1-REVIEW.md first. The handoff replaces the earlier
"pre-Phase-2 hardening" plan — follow the handoff, not the review's fix list.

Note the rigor change in handoff §1: V1 rigor from now on. One self-review
per PR plus CI. Revert-prove ONLY tests guarding money, data integrity or
tenancy. Known gaps go in §5 or an issue, not into scope. Each phase has a
PR budget; when it's spent, stop and report.

Add those four rules to CLAUDE.md's working agreement as your first PR,
together with deleting .github/workflows/cla-check.yaml,
.github/workflows/daily-blog-draft.yaml, .github/contributors.txt and
CLA.md (fix any references to them).

Then confirm branch protection is on:
  gh api repos/redemptia/redemptia/branches/main/protection
If required status checks are not enforced, STOP and tell me.

Then execute Phase 2 from handoff §6. Enter plan mode and give me ONE plan
for all of Phase 2; I approve once, then work through it without checking
in per PR. Merge each PR only after reading that every check concluded
success.

STOP and ask me only for:
1. Before the FIRST real LLM call (I need to confirm the key and budget).
2. Before any backfill that is not a --dry-run.
3. When Phase 2's exit criteria are measured — report agreement per class
   and measured cost per customer-month, then wait. Do not start Phase 3.
4. If the PR budget runs out before the exit criteria are met.
5. Three CI failures on the same cause.

Report once at the end of Phase 2: what merged, the measured agreement and
cost, what you deferred, and anything in the handoff that turned out wrong.
```

After Phase 2 reports, start Phase 3 with: *"Phase 2 exit criteria accepted. Execute Phase 3 from the handoff, same rules. Stop at the post-Phase-3 checkpoint."*
