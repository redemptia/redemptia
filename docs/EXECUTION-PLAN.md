# Brand Perception — Execution Plan

**Status:** approved to start at Phase 0 · **Version:** 1.0 · **Date:** 22 October 2026
**Companion docs:** `SPEC.md` (what gets built), `CONSIDERATIONS.md` (rules and traps),
`BRANCHING.md` (where work lands in git), `UPSTREAM.md` (divergence ledger, tracked in git)

**Superseded handoff (2026-10-30).** `phase-2-onward-handoff.md` (and `phase-1-handoff.md`) are not
authoritative. Their phase numbering, their sentiment-analyzer and keyword phases (stance table and
job, migrations 0105/0108, `searchDemandIndex`, `keyword_volumes`) are superseded by SPEC and this
plan. This product has no sentiment analyzer and no keyword plumbing; do not chase them or build
toward them. Migrations here are numbered from 0041.

---

## How to use this document

This plan is written for an agentic coding session, not for prompt-by-prompt instruction.
Each phase states its **goal**, its **done condition**, and its **checkpoint** — the point
at which work stops for human review. Between checkpoints the agent works from `SPEC.md`
and finds its own way around the codebase.

**The contract:**

- The agent reads `SPEC.md` and `CONSIDERATIONS.md` before starting a phase.
- The agent **stops at every checkpoint** and does not proceed without an explicit go.
- The agent **stops immediately**, before writing code, if it finds any fact that
  contradicts `SPEC.md` — and reports the contradiction with file:line evidence.
- Any edit to an elmo file not listed in §"Allowed divergences" is a **stop-and-ask**, not a
  judgement call.
- **Nothing existing gets fixed.** Behaviour that looks like a bug is assumed deliberate
  until proven otherwise (`CONSIDERATIONS.md` §2). Where we want different behaviour, we
  implement it in our own code path. An upstream fix is never a dependency of this build.
- Nothing paid runs until our own prompt cap is enforced in code.

**Checkpoint discipline.** Checkpoints exist where a wrong decision is expensive to unwind:
schema shape, invasive edits, anything that spends money, and anything a user will see. They
do not exist for ordinary implementation work. Nine checkpoints across six phases.

---

## Phase map

| Phase | Name | Gate to start | Rough shape |
|---|---|---|---|
| **0** | Foundations and gates | — | our cap, probe, exclusion, corpus |
| **1** | Fact verification | all of Phase 0 | tables, job, UI, accuracy gate |
| **1.5** | Attributes and association | Phase 1 accuracy gate passed | taxonomy, onboarding, classification |
| **2** | Market prominence | Phase 1.5 shipped | market prompts, prominence, heatmap |
| **3** | Polish and audits | Phase 2 shipped | overview cards, exports, shareable audits |
| **4** | Discovery | review queue proves insufficiency | clustering over the drift bucket only |

Phases 1.5 and 2 may run in parallel once Phase 1's gate has passed. They touch different
tables and different read paths, and prominence does not depend on association existing.

---

## Phase 0 — Foundations and gates

**Goal:** make it impossible for this feature to spend uncontrolled money, corrupt a
headline number, or ship an unverified verdict.

Nothing in Phase 1 begins until all five items are done. These are gates, not tasks.

### 0.1 — Our own spend ceiling

**Not #85.** Upstream's missing judge cap is a deliberate choice, not a defect
(`CONSIDERATIONS.md` §2): Jev calls are bounded by runs, runs are capped three ways, and the
only decoupled path — reprocessing — cannot touch our history because we carry our own stamp.
We do not gate on it, and we do not fix it.

What we control, and therefore cap:

- **Enabled perception prompts per brand**, enforced in code, with the
  100-prompts-per-brand headroom surfaced in the UI before prompts are created.
- **Our own Jev call volume** — a per-org daily ceiling on calls our job issues, with
  dry-run counting, and degradation rather than failure when it is reached.
- **Answer length**, capped at 20,000 characters before the call.

Degradation means our job stops judging new runs and says so; it never pauses anything of
elmo's, because text, citations and judgements share one transaction there and pausing it
blanks every dashboard.

> **CHECKPOINT 1 — the ceiling.** Confirm the per-brand prompt cap, the daily call ceiling,
> and what the UI shows when either is reached.

### 0.2 — Real Jev payload

Run the prepared probe (`/tmp/jev-live-probe.mts`) with a real key and a real passage —
15 closed-set questions over one answer, one request, no retry. Commit the raw request and
response as a **fixture**.

Why this is a gate: every schema claim in every design doc comes from our client's
TypeScript types, not a captured payload. The repo contains no recorded real Jev response;
tests use synthetic stand-ins. We are about to build a feature on an unverified contract.

What it settles: the true response shape (`confidence`? `type`? `model`?), real token usage,
and whether 15 questions over a normal-length answer triggers a split.

Cost: under one cent. Use the recon §I6 kids'-shoes answer as the passage.

### 0.3 — The headline exclusion

Implement exclusion-by-default across the server files listed in §"Allowed divergences".
Ship it **before** any perception prompt exists, so there is never a window in which
perception rows reach a headline number.

Verify by test: a perception prompt with runs must not change Visibility, SoV, Position,
Sentiment or the overview cards, and **must** appear in Citations, Fan-Out and Responses.

> **CHECKPOINT 2 — the diff.** Review the exact diff of every elmo file touched, against
> the allowed list, before merge. This is the feature's entire invasive footprint; it is
> reviewed once, carefully, rather than audited later.

### 0.4 — Calibration corpus

~30 real answers per brand. 8–15 **atomic** facts per brand (one assertion each). ~100
blind-labelled (fact, whole answer) items, each with the deciding passage marked: the judge
sees the whole answer, so the label is for the whole answer. Enriched with perturbed
contradictions, reported separately from natural items. Procedure:
`apps/worker/src/perception/calibration/PROCEDURE.md`.

Blind-labelled means the label is written before Jev sees the passage, by a human, without
reference to any model output. A corpus labelled after the fact measures agreement, not
accuracy.

This is a real week of work and cannot be generated. It is the only thing standing between
this feature and shipping a confident wrong number.

### 0.5 — Prompt-volume budget

Fill in the arithmetic with real provider prices:

```
provider cost = perception_prompts × models × runs_per_day × price_per_run
jev cost      = our 12 questions per association answer
              + elmo's ≤22 questions per answer of ANY class
```

Enforce a **hard cap on enabled perception prompts per brand, in code**. Surface the
100-prompts-per-brand headroom in the UI before prompts are created.

### 0.6 — No upstream fixes

Nothing in this plan depends on changing elmo's behaviour. The three things previously
listed here are struck:

- **Wrong-brand quotes** — our evidence selection restricts passages to sentences naming the
  subject. His stays as it is. Reporting it upstream is a separate decision on its own merits.
- **Onboarding failover** — our proposal path wraps its own fallback around the resolver
  (`CONSIDERATIONS.md` §7.1). We do not edit `resolveResearchProvider`.
- **#85** — see 0.1.

**Phase 0 done when:** our ceiling enforced in code · fixture committed · exclusion merged
and tested · corpus labelled · budget documented.

---

## Phase 1 — Fact verification

**Goal:** a user states what is true, and the product shows where AI contradicts them, with
the passage and the source.

Why first: it is the only capability elmo has no plan for, it is the cleanest fit for a
closed-set judge, and it needs no taxonomy. It is the differentiation.

### 1.1 — Schema

`perception_prompts`, `brand_facts`, `perception_verdicts`, `rollup_perception_daily`,
`perception_stamps`. Migration 0032 onward.

> **CHECKPOINT 3 — schema review.** Before the migration runs: table shapes, FK cascade
> chain, RLS, daily buckets, and the stamp design. Schema is the most expensive thing to
> change later.
>
> **Also raise here: fact atomicity.** The facts UI must enforce, or at least prompt for, one
> assertion per fact, and the LLM fact proposer must emit atomic facts (SPEC §5.5).

### 1.2 — The job

Register with one line in `apps/worker/src/index.ts`. Own queue, own schedule. Finds work by
scanning for perception-prompt runs with no verdict rows at the current stamp. Extracts its
own text via `extractRun`. One Jev call per answer. Writes verdicts, marks our rollup dirty.

Implement the length fallback here: on Jev 400 `max_tokens_exceeded`, truncate the answer
keeping its beginning and retry. Never drop questions.

### 1.3 — Facts UI

Settings page modelled on the competitors page: list, add, edit (creating a new row and
closing the old), retire. Validity dates visible. Copy must make immutability legible — the
user is creating a dated record, not editing a field.

### 1.4 — Fact prompts

Buyer-style questions that force concrete claims: "What does [Brand] cost?", "Does [Brand]
integrate with Salesforce?", "Is [Brand] self-hostable?". Short and factual, so the inverted
questions have clean answers.

The research LLM may propose candidate facts and their eliciting questions; the user accepts,
edits, or writes their own, and supplies the correct statement.

### 1.5 — Readout

The "answers that contradict your facts" view. Verdict counts with coverage. Every verdict
drills down to the passage, the model, the date and the source URL.

Unverified and false must be visually and verbally distinct.

> **CHECKPOINT 4 — accuracy gate.** Run the corpus. `contradicts` precision ≥ 0.85 with its
> lower 95% bound ≥ 0.75, and recall ≥ 0.70 on the same basis, reported for natural and
> enriched items separately. A too-wide interval is fixed with more contradiction items, never
> a lower bar. **If it fails, stop.** Do not ship with a caveat; report the numbers and the
> failure modes, and we decide whether to reshape the question or abandon the approach.

**Phase 1 done when:** the gate passes and a real contradiction is visible in the UI with
its passage and source.

**Phase 1 close-out, after a real user has accepted a few suggestions:** check the accepted
statements against what the proposer was told. Are they atomic (the compound sentence reduced
to its core), and as qualified as the page (the plan, add-on or condition kept)? Topic grouping
is enforced in code and tested; both of these rest on the prompt alone, and prompts drift.
Unverified as of 1.4 (decided 2026-10-23).

**Phase 1 close-out, before a real `TYPESAFE_API_KEY` goes in:** confirm nothing pending would
re-judge at cost. `PERCEPTION_VERSION` 2 (1.5) re-judges the last 30 days of fact-prompt runs,
and a stub-to-real switch re-judges whatever the stub judged. Count what the first real job would
pick up, and price it, before the key is set.

**Answered on an empty target (2026-10-29).** The target database has no data, so the first real
job picks up 0 runs, at $0. The count is `apps/worker/src/perception/calibration/first-job-count.sql`
(read-only; `-v stamp="'perception-2+jev-1.13.0+extractor-1'"`). **Re-run it against the target at the
moment `TYPESAFE_API_KEY` is set, not before:** an empty target today says nothing about the target
once runs exist. Pricing method, for that re-run: each call costs about (answer characters, at most
20,000, plus the questions) ÷ 4 tokens at the $0.042 per million tokens quoted in CONSIDERATIONS. The
dev average answer is 7,600 characters, so about 1.9k tokens, and with the questions perhaps 3k tokens
per run, roughly $0.0001 each; 10,000 runs would be about $1.30. This is an order of magnitude only:
whether Jev prices per token or per question is still open (CONSIDERATIONS §9), so the figure holds
only if it is per token. The count that matters beyond this job is Elmo's judge, which re-requests the
last 30 days at every worker start and reprocesses back 90 days when config changes, with no spend cap
(#85).

**Phase 1 close-out, run 2026-10-24:**
- **Live readout.** The dev database was migrated (46 recorded) and the page was seeded and screenshotted at 1280px and 390px: coverage, two contradiction alerts, grounding, and the below-10 state. Both widths read well.
- **SPEC §11.4, rule by rule:**

  | Rule | Status |
  |---|---|
  | 1. n beside every figure | met: n named once per fact row, and grounding says "of these answers" |
  | 2. Hidden below 10 | met |
  | 3. One denominator, named | met: "of 35 answers to fact prompts" |
  | 4. Coverage beside scores | not applicable: no attribute scores yet |
  | 5. Segment at version boundaries | not applicable: no charts yet |
  | 6. Judge-version changes marked | **not met**: #124 |
  | 7, 7a, 7b. Unverified ≠ false; coverage leads; grounding beside every verdict | met |
  | 8. Quotes about their subject | met by construction in the judge (1.5). The live seed inserted its passages directly |

- **Atomic and qualified statements.** Cannot verify yet: no suggestion has been accepted on any database (0 facts with a quote). Stays open until a real user accepts some.
- **Re-judge at cost.** Nothing pending. Dev has 0 brands with perception on, 0 fact prompts and 0 verdicts. Production has no data. Re-run this count on the target database before the real key goes in.

---

## Phase 1.5 — Attributes and association

**Goal:** a per-brand taxonomy, and the association scores and brand shape built on it.

### 1.6 — Taxonomy schema

`perception_attributes`, with the key/label/version/retire semantics from SPEC §4.3.

> **CHECKPOINT 5 — key semantics.** Confirm the rename / version / retire rules behave as
> specified, with a test per rule, before the attribute editor is built. These rules are
> the reason this feature does not accumulate history bugs; they are verified once, early.

### 1.7 — Proposal flow

Warm start from `run_extractions` sample (~60k chars); cold start from brand and industry via
`runStructuredCompletionPrompt`. Propose 12–15 attribute/prompt pairs; user keeps 10.

Off the hot path, degrades silently, falls back to a seeded category list if the provider
fails. Never reads the customer's own marketing copy.

> **CHECKPOINT 6 — first real proposals.** Review the proposals for 2–3 real brands before
> the flow is wired into onboarding. If the attributes read as generic category words rather
> than as this brand's actual market vocabulary, the grounding is wrong and the fix is in
> the prompt, not the pipeline.

### 1.8 — Attribute editor

List, add, rename, edit question text, retire. Shows prompt headroom. States plainly that
renaming is cosmetic and changing the question starts a new series.

### 1.9 — Association prompts and classification

6–10 association prompt variants that force attribute language. The job's association path:
12 questions, brand subject only, four-state options, plus the drift question.

### 1.10 — Readout

Association score bars. Brand shape radar (recharts, already installed). Review queue for
drift passages, with its rate displayed. Coverage and n on everything.

> **CHECKPOINT 7 — first real numbers.** Before this is visible to any user: do the
> association scores and the drift rate look like the brand? Read 20 drift passages by eye.
> This is the cheapest point at which a wrong taxonomy or a mis-worded question is still
> free to fix.

**Phase 1.5 done when:** a brand has 10 attributes, association scores with coverage, a
populated review queue, and a radar that matches what the answers actually say.

---

## Phase 2 — Market prominence

**Goal:** the competitive heatmap, and the gap between association and prominence.

Gate: Phase 1.5 shipped. Market prompts carry elmo's judge at up to 22 questions per answer,
which is the largest line in the cost model — but it is bounded by the prompt count we cap in
0.1, so it is a budget to size, not a gate to wait on.

### 2.1 — Market prompts

One per attribute: "Which [industry] brands are strongest on [attribute]?". Created from the
attribute/prompt pairs the user confirmed in 1.7.

### 2.2 — Prominence computation

From `run_mentions` per answer, **not** from the rollups. `rollup_prominence_daily` stores
`answers`, `mentioned_answers`, `inverse_position_sum` and the competitor-set fingerprint so
the score recomputes correctly at read time and across combined buckets.

> **CHECKPOINT 8 — the formula against real data.** `100 × mean(mentioned ? 1/position : 0)`
> is a reasoned choice, not a verified one, and Peec's definition is unknown. Check it
> against real answers before it becomes the number customers quote. Confirm that
> "named rarely but first" and "named often but fourth" read correctly, and that the two
> components shown beside the score make the difference legible.

### 2.3 — Heatmap and gap

The attribute × brand grid with the prominence legend. Competitor-set fingerprint stated.
Charts segment at a fingerprint change.

The gap number, shown only where both sides clear n=10.

### 2.4 — Attributes & sources

Expandable per-attribute source tables: URL, URL type, domain type, occurrences, retrievals,
citation rate. Occurrences / retrievals / citation-rate columns are new; the rest reuses
`CitationsDisplay`.

**Phase 2 done when:** the heatmap matches the screenshots, the gap number is live, and
every cell drills to its sources.

---

## Phase 3 — Polish and audits

Overview cards (most associated, best competitive, biggest gap, strongest competitor) —
built last, because every one of them is an aggregate of numbers that must be trustworthy
first.

Model filter across all perception views. Shareable perception audits (requirement D) —
export or share a point-in-time snapshot with its fingerprints, coverage and version stamps
intact.

> **CHECKPOINT 9 — pre-release review.** Walk every display rule in SPEC §11.4 against the
> live UI. This is the review that catches what elmo's own Sentiment page gets wrong:
> three denominators for one metric, scores on n=2 ranked beside n=280, unbroken lines
> across definition changes.

---

## Phase 4 — Discovery

Only when the review queue proves the hand-picked list is insufficient, and only over the
drift bucket — a few hundred passages, never the whole corpus.

Embeddings plus clustering, or a monthly off-path LLM pass behind a configurable provider
target. Degrades silently; falls back to the shipped taxonomy.

Do not start this because the drift rate crossed a number. Start it when reading the queue
makes it obvious which attributes are missing.

---

## Allowed divergences

Every elmo file this plan may touch. **Anything not on this list is a stop-and-ask.** This
list is mirrored in `UPSTREAM.md`, which is tracked in git — this doc is gitignored and will
not survive a fresh clone.

| File | Change | Phase |
|---|---|---|
| `server/prompt-resolution.ts` | exclusion option on `resolveFilteredPrompts` | 0.3 |
| `server/analytics-core.ts` | headline scope for the headline functions; citations and fan-out keep the plain scope | 0.3 |
| `server/analytics-core.ts` → `getBrandAnalytics` | label or exclude the mixed summary payload | 0.3 |
| `server/visibility.ts` | pass the exclusion | 0.3 |
| `server/dashboard.ts` | pass the exclusion | 0.3 |
| `server/prompts.ts` | `getPromptsSummaryFn` opt-in flag | 0.3 |
| `server/responses.ts` | the header count is a brand-level number | 0.3 |
| `server/opportunities.ts` | digest exclusion | 0.3 |
| `routes/…/settings/prompts.tsx` | hide perception prompts in the editor's loader | 0.3 |
| `components/app-sidebar.tsx` | one nav item | 1.5 |
| `components/app-sidebar.tsx` | one brand-settings nav item (the brand settings list lives in this same file, not in the settings index route as recon K8a said); same justification as the main nav item | 1.3 |
| `packages/lib/drizzle.config.ts` | one `schema` array entry for `./src/db/schema-perception.ts`, so drizzle-kit generates our tables; 1 upstream commit in 6 months | 0.3 |
| `packages/lib/package.json` | one `exports` line for `./db/schema-perception`. Of 88 upstream commits in 6 months, 18 touched the exports block (3 in October 2026), so a conflict here is possible and is a keep-both resolution | 0.3 |
| `routeTree.gen.ts` | regenerated, never hand-merged | 1.5 |
| `apps/worker/src/index.ts` | one `registerPerceptionJobs(boss)` line | 1.2 |
| `routes/…/sentiment.tsx` | **avoid** — copy `Quotes`/`QuoteRow` rather than exporting them | 1.5 |
| 3 small client files | opt-in filters | 0.3 |

**Never touched:** `analyze.ts`, `jev.ts`, `derive-runs.ts`, `analysis-versions.ts`,
`mentions.ts`, `rebuild.ts`, `packages/lib/src/db/schema.ts` (every perception table lives in
`schema-perception.ts`, so `git diff upstream/main -- schema.ts` stays clean for migration
renumbering), the `assessments` column, and all existing rollup tables.

---

## Standing rules for the session

1. **Read `SPEC.md` and `CONSIDERATIONS.md` before each phase, and `BRANCHING.md` before any
   branch, commit or merge.** They are the contract.
2. **Stop at checkpoints.** Report what was built, what was verified, what is uncertain.
3. **Contradiction beats plan.** If the code says something the spec does not, stop and
   report with file:line before writing anything.
4. **Additive by default.** New files, new tables, new rollups. An edit to an elmo file
   outside the allowed list is a decision, not an implementation detail.
5. **Never fabricate verification.** "Unverified" is an acceptable answer; a confident wrong
   citation is not. Three citations were wrong in the first recon pass and were corrected —
   that correction is the standard.
6. **Keep `UPSTREAM.md` current, in the same commit as the divergence.** Twelve files are
   manageable only if the list is accurate; without it, month four is archaeology.
7. **Golden set before tuning.** Never tune a question against impressions.
8. **Every figure ships with its n and its denominator.** No exceptions, including in
   internal debug views, where a bad habit starts.
