# Phase 1 review (adversarial)

Scope: `f904e79b..d5e9e79f`, ten commits: #27, #28, #30, #31, #32, #33, #35, #37, #38, #39.

Evidence is file:line on `main` at the time of writing, or a command I ran and its output. "Cannot verify" means exactly that.

An independent reviewer, who hadn't seen the work, reviewed the same diff. Its findings are in **Independent review**, with every disagreement explained.

## Blocking first

**#36 breaks the Phase 1 contract and is shipped.** A run whose answer text is NULL, including runs where extraction *failed*, is reported as analysed with zero mentions. My Phase 1 report said "not analysed is never shown as zero"; for NULL-text runs that was false. See §3.

## 1. Process

- **a. Working agreement.** Merged as #40 (`CLAUDE.md`).
- **b. `CLAUDE.local.md`.** Your premise needs one correction: it *was* ignored, but only through `.git/info/exclude:7`, which exists on this machine alone. So it was ignored here and invisible to everyone else.
  - The durable part (execution rules, gate, baselines, flaky tests, stop-and-ask, facts) moves into `CLAUDE.md` in #41, with two facts corrected (§2 and §3).
  - `CLAUDE.local.md` is now in `.gitignore` and keeps only paths, tool versions and local database names.
- **c. PR count.** `git log --oneline f904e79b..HEAD` shows **ten**. "Twelve" in my report was wrong: the table under it listed ten.

**Process incident in this review.** A `cd` into a git worktree failed, so a chained command committed to local `main`. The push was rejected and nothing reached the remote. I moved the commit to a branch and reset local `main` to `origin/main`. Lesson: never chain `cd` with `&&` into commands that commit.

## 2. Issue #24 (competitor rename)

I ran this on a scratch database with the real write paths: `setBrandCompetitors` for the dashboard, a direct `UPDATE … SET name` for the API PATCH, then `reconcileRunAnalyses`. The four answers were "Globex leads.", "Acme and Globex.", "Acme only.", "Globex Corp is new.".

| Path | Before rename | Before recompute | After recompute |
|---|---|---|---|
| **Dashboard** | id `2bc2c6df` "Globex", **3 runs** | new id `6037d98e`; old id's 3 rows still stored but **not counted**; coverage 0/4 | id `6037d98e` "Globex Corp", **1 run**; old id's rows **deleted** |
| **API PATCH** | id `aac81dae` "Globex", 3 runs | (same id) | id `aac81dae` "Globex Corp", **1 run** |

**Does history fork into two series?** No. Recompute deletes each run's rows before rewriting them (`packages/lib/src/enrichment/write.ts:writeRunAnalysis`). The old id's rows are uncounted while stale (the fingerprint differs, `reconcile.ts:isStale`) and gone after the recompute.

**What the customer sees after renaming a competitor tracked for 60 days:**
1. Coverage drops to 0% for the whole brand until the recompute finishes (§5: measured ~20 min for a Business brand).
2. Then the renamed competitor's **60-day history is re-matched to the new name**. Every answer that said "Globex" but not "Globex Corp" stops counting, on **both** paths, unless the old name is kept as an alias. Matching uses current names: `analysis.ts:brandSubjects` and `locateSubject`.

**Is this inherent to `(brand_id, name)`?** Yes. `setBrandCompetitors` deletes every stored name missing from the submitted list (`apps/web/src/server/competitors-core.ts:76`) and upserts by `(brand_id, name)` (`:82`). The dashboard editor submits no ids, so a rename can't be told apart from a delete plus an add. **#13's guarantee only ever covered saves that didn't rename.**

**Is #24 the same defect #13 was meant to fix? Yes.** #13 exists so that data keyed on a competitor id isn't orphaned, and the dashboard rename above changes the id (`2bc2c6df` → `6037d98e`).
- Phase 1 masks it: mention analysis is recomputable from text, so the orphaned rows are rewritten.
- Phase 2 won't be masked: a paid judgement keyed on competitor id can't be recomputed for free.

**A separate finding the independent reviewer missed:** renames rewrite history through re-matching, on any path. That's a product decision (carry the old name as an alias?), not an id problem.

## 3. Issue #36 (NULL text counted as analysed)

**The SQL and code that produce it:**
- `packages/lib/src/text-extraction.ts:55`: `answerTextOrNull` returns NULL for blank text and for every `EXTRACTION_SENTINELS` entry.
- `packages/lib/src/enrichment/analysis.ts:87`: `if (text === null) return [];`, so there are no mention rows.
- `packages/lib/src/enrichment/write.ts:44,64`: `writeRunAnalysis` writes the marker regardless.
- `packages/lib/src/enrichment/reconcile.ts:82`: the batch query is `JOIN run_texts rt …` with no `rt.text IS NOT NULL`, so NULL-text runs are analysed.
- `apps/web/src/lib/postgres-read.ts:1413–1415`: the read's `analysed` CTE is `JOIN run_texts rt … WHERE NOT isStale(…)` with no text check, so these runs count as analysed and enter the mention-rate denominator.

**Run states that land here:**
1. Blank answers, and every `EXTRACTION_SENTINELS` entry. That includes extraction **failures** such as `"Error extracting text content."`, which `text-extraction.ts` returns from several catch blocks. The independent reviewer reproduced this one against `redemptia_test`: `{ brand_mentioned: true, text: null, analysed: true, mentions: 0 }`.
2. A backfill re-extraction that throws: `packages/lib/src/run-texts.ts:167` sets `extracted = null`.
3. #18's divergent paths (BrightData chatbot, Mistral web search, DataForSEO LLM Scraper), where the backfill re-read is NULL although the live run had an answer.
4. Every stub-provider run: `stub.ts:40` returns `textContent: ""`. That's harmless in production, but it is every local and e2e run.

**Is 100% coverage ever a lie today?** Yes. Exactly when any run in the window has `run_texts.text IS NULL` and a current marker. "Analysed" then includes runs that had nothing to analyse. Those runs also inflate the mention-rate denominator, so rates are understated, while Visibility can say the brand was mentioned (the reviewer's repro has `brand_mentioned: true`).

**Reconciling with my report.** The claim held for missing and stale markers, and is enforced (`isStale` in the read and the reconciler). It did not hold for NULL-text runs, and three tests lock in the wrong behaviour:
- `mention-analysis.integration.test.ts`, "marks a run with no answer text as analysed, with no mentions";
- `mention-reconcile.integration.test.ts`, "analyses a run whose answer was empty as having no mentions";
- the `worker.spec.ts` assertion (`mentions: 0` for the stub).

Under the working agreement those tests should change when #36 is fixed.

## 4. Tenancy

**Correction: it was your call.** In chat 4 the options were (1) brand-scoped and gated at the edge, or (2) also thread a `scope` key into the core. You answered: *"Option 1. The scope key solves a cross-tenant LIST failure mode that a brand-scoped read doesn't have — the brand id is the scope."* The removal proofs below are what you asked for then.

Removal proofs, run now, each against the full web suites (unit 544, integration 101):

| Gate removed | Result |
|---|---|
| v1 route `requireBrandInScope` (`apps/web/src/routes/api/v1/brands/$brandId/mention-prominence.ts:13`) | integration **1 failed**: "refuses another tenant's brand without revealing its runs" |
| MCP `analyticsTool` `requireBrandInScope` (`apps/web/src/lib/mcp/tools/analytics.ts:36`) | unit **5 failed** (tenancy.test for every analytics tool) and integration **1 failed** |
| **Dashboard server fn `requireBrandSession`** (`apps/web/src/server/analysis.ts:90`) | **all green: 544/544 unit, 101/101 integration** |

**Tenancy hole: yes, in the tests, not in the code.** The dashboard edge `getMentionProminenceFn`, which the Mentions page uses, is correctly gated today. Deleting that one line would let any signed-in user read any brand's mention analysis by id, and no test would fail. This is the existing #21 ("Cover the dashboard's tenancy gate with a test"), now with a concrete instance.

**Can the read be called from anywhere?** Yes. `getBrandMentionProminence(brandId, …)` (`apps/web/src/server/analytics-core.ts:490`) takes a bare string, like every analytics-core function. Nothing structural stops a Phase 2 server function, core or script from calling it ungated. The structural fix is #20: make verified brand ids a type only the tenancy gates can produce.

## 5. Evidence for the numbers

**Data used everywhere below:** one Business-sized brand, 504,000 `prompt_runs` rows actually inserted (verified with `COPY 504000` and `count(*)`). Text is synthetic: 4 KB chunks of `packages/docs` prose, with mentions injected at seeded rates. One machine, warm cache, a single-brand database. Real answers and real mention rates are unknown (zero spend).

| Number | Measured or modelled | How |
|---|---|---|
| 20–110× store vs compute | **Measured**, but the compute side is a proxy | Compute-on-read was SQL `strpos(lower(text))` over 504k real `run_texts` rows: 19 / 51 / 103 s at 2 / 4 / 8 KB. Stored read: 0.93 s on a simulated sparse table, populated from the seeded flags with random offsets. The real JS `locateSubject` was never run at read time. |
| 248 MB vs 846 MB | **Measured**, on bulk-loaded simulated tables (731k and 3.02M rows) | **Today, at 504k, written by the real reconciler: `run_subject_mentions` is 328 MB, plus a 56 MB marker table.** So 248 MB understates the pipeline-written size by ~32%. |
| 1.6–1.8 s read | **Measured**, re-measured now: 1.62–1.75 s | Real 0104 tables, written by the real backfill, 504k runs, 737,146 mention rows. |
| ~13 min recompute | **Modelled, and wrong** | It was 259 s of raw backfill plus a computed 5,040 × 100 ms pause. **Measured now, running the job's own handler (`recomputeBrandMentionsJob`, batch 100, pause 100) at 504k: 1,139 s, about 19 minutes. The model was 46% low.** |

**Was 504k extrapolated from 200 runs?** No. The 200-run figure is only the dev proof script (#39). Every 504k number came from 504k inserted rows.

## 6. Design grains

**a. A per-subject fingerprint.** Adding a competitor would invalidate only that subject:
- Other subjects keep 100% coverage, and the new one shows "not analysed" on its own row.
- **What it doesn't save:** the new subject still has to be located in every run's text, so recompute CPU and I/O are about the same.
- **Cost:** the marker becomes a per-run map of subject → fingerprint (about +50 B per subject per run, roughly 150 MB per brand per 90 days at 6 subjects), or a dense run × subject marker table, which is the grain we rejected. Coverage becomes a per-subject query.
- **Why brand-wide was chosen:** one equality check per run and a small marker. The cost (the whole brand at 0% during a recompute) was accepted without being measured; it is now: about 19 minutes at 504k.
- **Recommendation:** per-subject coverage is the better product. Do it as part of fixing #36, since both change the marker.

**b. A fast and consistent read.** Measured at 504k, 4 warm runs each:

| Variant | Time | Consistent? |
|---|---|---|
| A: shipped single statement (CTEs) | 1.62–1.75 s | yes |
| B: two statements in parallel | 0.93–1.03 s | **no** |
| C: two statements in one REPEATABLE READ transaction | 1.44–1.56 s | yes |
| **D: two statements in parallel, on one exported snapshot** (`pg_export_snapshot` / `SET TRANSACTION SNAPSHOT`) | **0.87–0.90 s** | **yes** |

D is both fast and consistent. It needs two pooled connections per read.

**Separately (independent reviewer, confirmed):** at this volume the read **seq-scans all five tables**, and `run_subject_mentions_prompt_created_idx` is **not used** (`EXPLAIN` at 504k). The read reaches mentions through `prompt_run_id`, so the 90 MB, 7-column index is pure write cost for now. Cannot verify the plan on a multi-tenant table.

## 7. Unaddressed

**a. Does a stored analysis record what it scored?**
- It records the `extractor_version` it scored (`packages/lib/src/db/schema.ts:291`), but not `source` or `content_hash`.
- Re-extraction is detected today: every `run_texts` rewrite in the backfill only happens with a higher `extractor_version` (`run-texts.ts:146`, `setWhere: lt(...)`), and `isStale` compares versions.
- **Not detected:** any text change without a version bump, such as a manual `UPDATE` or a future writer. Storing `content_hash` on the marker would close that cheaply.

**b. Growth (#29).** From the measured 90-day sizes, so modelled:
- Mention plus marker tables: (328 + 56) MB per brand per 90 days ≈ **1.56 GB per brand per year ≈ 7.8 GB per 5-brand customer per year.**
- `run_texts` adds ~1.43 GB per brand per 90 days at 4 KB (measured): ≈ **29 GB per customer per year.**
- Nothing stops it: no retention, and rows go only when a prompt is deleted (cascade).

**c. Entitlements.** Nothing gates the Mentions page, and no flag exists. Whether prominence and rank stay free on every plan is a product decision I can't make. If it's ever gated: ship the `entitlementOverridesSchema` key first, then any data that uses it.

## 8. Break it

Three load-bearing pieces, each mutated and run against the full web suites:

| # | Mutation | Caught? |
|---|---|---|
| M1 | Stale predicate ignores the subject fingerprint (`reconcile.ts:isStale`, shared by read and reconciler) | **caught**: 6 integration tests |
| M2 | Dashboard competitor save stops queueing a recompute (`apps/web/src/server/brands.ts`, `updateCompetitors`) | **UNDETECTED**: 544 unit + 101 integration green |
| M3 | API competitor PATCH stops queueing a recompute (`apps/web/src/routes/api/v1/competitors/$competitorId.ts`) | **UNDETECTED**: all green |
| M4 | Queue policy `exclusive`, so an edit during an active recompute is dropped (the recompute vs concurrent-save race) | **caught**: the recompute queue policy test |
| M5 | Reconcile reads subjects before taking the brand lock (3 runs) | **caught 3/3**: the lock-ordering test |
| — | Dashboard server fn gate removed (§4) | **UNDETECTED** |

**Undetected, so these are the real gaps:**
- Of the nine write paths that call `enqueueMentionRecompute`, only `updateBrand` is under test. Dropping the enqueue from any other one leaves that brand stale until a manual backfill.
- The dashboard tenancy gate (§4).

**The recompute vs concurrent competitor-save race isn't tested as it happens in production.**
- The lock-ordering tests use a stand-in writer that *takes* `lockBrandAnalysis`. No production edit path does: `setBrandCompetitors` is a diff upsert in its own transaction and never takes the brand lock.
- The real interleaving: a batch reads subjects under the lock, the save commits mid-batch, the batch stamps old fingerprints, and `stately` queues a follow-up that fixes them.
- That convergence rests on M4's policy and the enqueue after commit. No test runs that sequence end to end. I reasoned it converges (so did the independent reviewer); it isn't proved.

## Independent review

A fresh reviewer, with no context, reviewed `f904e79b..HEAD`. Summary:

1. **BLOCKER: NULL-text runs read as analysed.** Reproduced. **Agree:** §3.
2. **Should-fix: dashboard gate untested.** **Agree**, and proved: §4.
3. **Should-fix: no automatic trigger** for failed live writes, runs without text, version bumps, failed enqueues or exhausted retries. The page then polls every 30 s forever while coverage is below 100%. **Agree.** The "rises while you watch" copy is wrong for those states.
4. **Nit: the lock tests simulate a writer that doesn't exist.** **Agree**; it's the race gap in §8.
5. **Nit: weak read tests.** The model-filter test only checks a model with no runs, and the rank-parity test computes its expectation with production code. **Agree.**
6. **Nit: the covering index is unused.** **Agree**, confirmed by `EXPLAIN` at 504k: §6b.
7. **Nit: subjects and coverage come from separate statements.** Agree; harmless and self-correcting on the next read.

**Where I disagree.** On renames it concluded "no wrong output, only a temporary drop in coverage". The table in §2 shows otherwise: after recompute, a renamed competitor's history is re-matched to the new name and loses every answer that used only the old name (3 → 1), on both rename paths. That's a permanent change in output, not a temporary drop.

## 9. Verdict

| Area | Score | Why |
|---|---|---|
| Correctness | 3/5 | The stale contract and convergence design hold up under two reviews, but NULL-text runs are mislabelled analysed (#36) and renames silently rewrite history. |
| Test rigour | 3/5 | Revert-proved throughout, but three tests lock in #36, 8 of 9 enqueue paths are untested, and the race is only tested against a fictional writer. |
| Tenancy safety | 3/5 | All three edges are gated correctly, but the dashboard gate is untested and nothing structural prevents an ungated call (#20, #21). |
| Performance | 3/5 | A 1.6–1.75 s read with five seq scans and an unused 90 MB index. A consistent 0.88 s variant exists. A Business-brand recompute takes about 19 minutes (measured), not the 13 I modelled. |
| Migration safety | 4/5 | One additive migration, upgrade-checked in CI. It takes a brief lock on `prompt_runs` for the FK. |
| Scope discipline | 4/5 | Speculative work was deferred (#25), with one exception: index columns added for model and rank reads that never shipped. |
| Phase 2 readiness | 2/5 | Paid work would run on mislabelled runs, key on churnable competitor ids, and have no spend ceiling (#9). |

**Fix before Phase 2, ranked:**
1. **#36: give runs with no answer their own state.**
   - Write the marker with a text state (answered / no answer / extraction failed), or skip the marker. Exclude non-answers from "analysed" and from the denominator, and report them separately.
   - Rewrite the three tests that lock in today's behaviour. Fold in per-subject fingerprints (§6a) and `content_hash` (§7a), since all three change the marker.
   - Effort: about 1–1.5 days, including migration 0105.
2. **Test every edge and every enqueue.**
   - A dashboard tenancy test for `getMentionProminenceFn` (#21).
   - A table-driven test that each of the nine subject write paths enqueues a recompute.
   - An end-to-end test of a real `setBrandCompetitors` landing mid-recompute, then converging.
   - Effort: about 1 day.
3. **Automatic convergence and a usable read.**
   - A scheduled sweep that enqueues a recompute for any brand with stale or unanalysed runs, so failed writes, version bumps and lost enqueues heal. Stop the page polling forever.
   - Switch the read to the exported-snapshot variant, or drop the unused index.
   - Effort: about 1 day.

**Biggest risk carried into Phase 2:** paid LLM judgements built on this layer, and keyed by competitor id, inherit three problems:
- #36 means money is spent judging runs that have no answer, and the rates are understated;
- #24 means a dashboard rename orphans paid rows that can't be recomputed;
- #9 means nothing caps the spend while either goes wrong.
