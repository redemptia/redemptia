# Brand Perception — Key Considerations

**Status:** standing reference · **Version:** 1.0 · **Date:** 22 October 2026
**Companion docs:** `SPEC.md` (what), `EXECUTION-PLAN.md` (how and when),
`UPSTREAM.md` (divergence ledger, tracked in git)

This document holds the reasoning that `SPEC.md` states as rules: why each rule exists, what
goes wrong without it, and where the evidence is. Read it before changing anything in the
spec — most of these rules look like overcaution until you see what they are protecting
against, and all of them come from behaviour verified in elmo's own code or visible in its
live demo.

---

## 1. Hard rules — no exceptions

These are not preferences. Breaking any of them creates a class of bug that cannot be fixed
after the fact, only migrated around.

| # | Rule | What breaks without it |
|---|---|---|
| 1 | **Never write into `assessments`** | `analyze.ts` rebuilds that object in full on every re-judge. Any key we add is silently lost on the next brand rename. |
| 2 | **Own stamp, never `brands.analysis_versions`** | A brand rename would re-judge the entire perception history alongside sentiment — paid, and silent. |
| 3 | **Daily rollup buckets** | 15-minute buckets barely compress at 566k rows (#26). Attributes multiply that by N. There is no path back from 15-minute buckets once history exists. |
| 4 | **Facts are immutable; edits create rows** | Mutating a fact in place makes January's answers retroactively wrong when March's price changes. The whole feature's credibility rests on this. |
| 5 | **Attribute `key` is opaque and never reused** | A reused key silently merges two different attributes' history. Unfixable afterwards. |
| 6 | **Every figure carries n and its denominator** | See §3. This is the single most common way the existing product misleads. |
| 7 | **Hide below n=10** | A score of 100 on 2 mentions is not a weak signal, it is a wrong one. |
| 8 | **Unverified ≠ contradicted** | Presenting "no fact covers this" as "AI is wrong" is the one failure that would make this feature actively harmful. |
| 9 | **Nothing paid before *our own* cap is enforced in code** | Our prompt count, not elmo's judge, is the spend we control. Upstream's uncapped reprocess paths do not re-judge our history — we have our own stamp (§2). |
| 10 | **Nothing displayed before the accuracy gate** | Zero accuracy evidence exists today. Every schema claim came from TypeScript types until the probe runs. |

---

## 2. Deliberate choices, not bugs

**Operating assumption: the upstream author did not ship these unknowingly.** Nearly
everything we initially read as a defect is a defensible trade-off made by someone whose
cost discipline is visible throughout the repo — `retryLimit: 0` on the money-spending job,
raw payloads stored whole, detection kept deliberately dumb, locale pinned and documented,
scope boundaries written into prompts. That is not a careless build.

**Policy: we do not fix what exists. We build on top of it.** Our views apply our own
standards; his views keep his. Where we want different behaviour we implement it in our own
code path, not by editing his. An upstream fix is a separate decision, made for its own
reasons, never as a dependency of this feature.

| Looks like | Actually | Why it is defensible | What we do |
|---|---|---|---|
| **No judge spend cap (#85)** | deliberate | Jev calls are bounded by runs — one per answer naming a tracked company — and runs are capped three ways. The judge is transitively capped. The scrape lane, the expensive one, *is* explicitly protected. The only decoupled path is reprocessing, bounded at 50k runs / 90 days and only on config change. And the obvious fix — a pause switch — blanks every dashboard (§8), so a naive cap is worse than none. | Cap **our own** prompt count and call volume. Leave his alone. |
| **3-sentence quote window bleeding into rivals** | deliberate trade-off | A one-sentence window loses context — "It's expensive" about what? Three buys context at the cost of bleed, and Jev filters by picking the best candidate. It affects an evidence quote, never a score. | Our evidence selection restricts passages to sentences naming the subject. His stays. |
| **No minimum sample size** | deliberate | The README promises every metric is readable and verifiable in-repo. Showing the real number on n=2 is consistent with that; hiding or smoothing it is a product opinion. | n=10 floor on **our** figures. A product standard, not a correction. |
| **Prompt edits keep the same id and draw one line** | scope decision | Prompt versioning is a feature, not a missing guard. Not building it is a choice about what the product is. | Our attribute questions version and segment. We do not add prompt versioning to his. |
| **Competitor rename orphans history** | deliberate | Follows from keying on text, which is the same reasoning as the substring matcher: reproducible and legible beats clever. | Inherit it. Alias lists reviewed per brand. |
| **`.reason` captured and never read** | deliberate | Storing more than you display is the `raw_output` philosophy applied to a smaller field. It is there for debugging and for later. | Our drift answer **is** displayed — because we want the metric, not because his is wrong. |
| **Unjudged runs absent from rollups** | deliberate | An inner join encodes "a run is not real until it is judged." Defensible, and it keeps denominators honest. | Show coverage so the gap is visible in our views. |
| **Jev failure loses text and citations too** | deliberate atomicity | One transaction means no run ever exists with text but no mentions. Partial rows would poison every denominator downstream. | Extract our own text from `raw_output`, which is written before any judging. Additive. |
| **Disabling a prompt erases its history from charts** | deliberate | "Disabled" means "not tracked." | Hide perception prompts from the editor so nobody does it by accident. |
| **Bulk save recomputes `system_tags` for every prompt** | deliberate idempotence | Recomputing from text is correct; it just means the column cannot hold anything else. | Side table. Never fight the writer. |
| **Two timezones, two daily numbers** | stated as by design | Every offset is a multiple of 15 minutes, so buckets never straddle a local midnight. | Inherit. |
| **Locale pinned to `2840`** | deliberate, documented | A stated limitation beats silent variance. | Inherit knowingly. |
| **Single migration journal, elmo's migrations renumbered on catch-up** | deliberate | Renumbering incoming elmo migrations is safe, because a renumbered migration has never been recorded in any Redemptia database's `__drizzle_migrations` — self-hosters only ever see our numbering. The hazard would be renumbering our own applied migrations, which we never do. A split journal would cost a Dockerfile divergence on a file identical to upstream, plus a seeding migration that fabricates rows in drizzle's internal table on every existing database, and it does not remove the `drizzle.config.ts` divergence — it trades one small one for two. | Single journal. Renumber at each catch-up per UPSTREAM.md. |

### The one genuine defect

**Onboarding provider failover.** `resolveResearchProvider` picks the first provider with a
key *present* and never falls through on failure — a 429 or 401 produces no second candidate,
retries are `retryLimit: 1, retryDelay: 10`, and the startup check verifies that keys exist,
never that they work. The user sees *"Brand analysis failed. Please try again."* and the
wizard cannot proceed. There is no upside to this behaviour and no trade-off being bought.

It is also the only one that would block *us*: attribute proposal uses the same resolver.

**We still do not edit it.** Our proposal path wraps its own call with its own fallback —
try the resolved provider, fall through to the next configured one on failure, degrade to a
seeded category list if all fail. That is additive, it is behaviour we want anyway (the
proposal is off the hot path and nobody is waiting), and it leaves his resolver untouched.
Whether to report it upstream is a separate decision, made on its own merits.

### What this policy costs us

Three things we would otherwise have fixed stay broken in his views: wrong-brand quotes,
unlabelled denominators, and unmarked definition changes. Users of the Sentiment page keep
seeing them. We accept that, because every fix to a shipped metric is a trust event for
every operator running elmo — and re-judging their history to improve our evidence quotes is
not a cost we get to impose.

---

## 3. Where numbers move silently — the full list

Traced from elmo's code. Every one of these can change a chart a user already read, with no
new runs and no notice anywhere in the UI. Perception inherits the ones marked ▲ unless the
spec's countermeasure holds.

| # | Cause | Effect | Perception |
|---|---|---|---|
| 1 | Prompt text edited in place | Same id, same history, unbroken line; later re-judges use the new wording on old answers | ▲ countered by versioning |
| 2 | Unjudged runs join later | Past days' numbers change when a run is finally judged; unjudged runs are missing from `runs` too, not just sentiment | ▲ countered by coverage display |
| 3 | Re-judging covers only `REPROCESS_DAYS` (90) | Older runs keep old verdicts; the trend mixes two judges with no marker | ▲ countered by stamp marking |
| 4 | Competitor renamed | History older than the window stays under the old name and disappears from charts, which look up by the current name | ▲ known, documented limitation |
| 5 | Prompt disabled | Its entire history vanishes from every chart | ▲ countered by hiding perception prompts from the editor |
| 6 | Prompt deleted | History permanently gone — runs, citations, rollups cascade | accepted; our rows cascade too |
| 7 | No minimum sample | 1 mention shows as 100, 50 or 0 | ▲ countered by n=10 floor |
| 8 | Invalid API key | Every dashboard stops updating, because extraction and judging share a transaction | ▲ partly countered by own extraction |
| 9 | Competitor added or removed | Re-ranks the last 90 days; older answers keep the old ranking | ▲ countered by fingerprint |

**Nothing in elmo's web UI mentions reprocessing, unjudged runs, or re-judging.** A search of
`apps/web/src/**/*.tsx` found no reference to any of it. Users are reading numbers that move
underneath them with no indication that this is possible.

That is the bar perception is being built against — and it is a low one. Clearing it is not
hard; it just has to be deliberate.

---

## 4. Cost — where it actually comes from

The intuition that "attributes are expensive because there are ten of them" is wrong, and it
led two earlier drafts astray.

```
provider cost = perception_prompts × models × runs_per_day × price_per_run     ← dominant
jev cost      = our 12 questions per association answer                        ← small
              + elmo's ≤22 questions per answer of ANY perception class        ← larger
```

**Three things worth internalising:**

1. **Provider scraping dominates.** Jev is roughly a rounding error at $0.042/M. Ten
   perception prompts × 5 models × daily cadence is the line item that matters.
2. **Market prompts are the expensive class, not the cheap one.** We issue no attribute
   questions on market answers — prominence comes from mentions and position — but market
   prompts are ordinary elmo prompts, so elmo's judge runs on every market answer at up to
   22 questions. That spend is real, but it is bounded by the number of perception prompts
   we enable, which we cap ourselves. It is a budget line, not an uncapped path.
3. **Question count was never the real constraint; answer length is.** `askFitting` splits
   only when Jev returns `400 max_tokens_exceeded` — there is no pre-send threshold — and it
   resends the full passage with each half. Our job does not use it (it is not exported), so
   our fallback is ours to define: truncate the answer, never drop questions.

**Why "never drop questions" matters:** a dropped attribute question is indistinguishable in
the data from a genuine `not_discussed`. Truncation loses some evidence; dropping questions
fabricates coverage.

### Abandoned: 10 attributes × 11 subjects

An earlier draft had Jev classify brand *and* competitors against all 10 attributes on market
answers: 110 questions per answer, five times elmo's current maximum. It was abandoned not
merely for cost but because **it does not produce the number the dashboard displays.** Peec's
heatmap legend reads "market prominence (0 to 100) — a higher score means the brand tends to
be named earlier." That is mention-plus-position, which elmo already computes. 110 questions
would have cost five times as much and still left the heatmap empty.

Per-competitor attribute *sentiment* ("the market says Lululemon is good on community, not
just that it is named first") is a genuinely interesting third metric. It is priced
separately, later — not folded into Phase 2 on the assumption that it is the same thing.

---

## 5. What Jev can and cannot do

Jev is a **general closed-set multiple-choice judge**, not a sentiment service. Our client
implements only `type: "choice"`. Whether free-text questions exist could not be verified
from the repo — ask TypeSafe.

| Capability | Shape needed | Jev |
|---|---|---|
| Identity and mention interpretation | classification | ✅ shipped |
| Attribute rating against a known list | classification | ✅ |
| Fact verification against supplied ground truth | classification | ✅ |
| Drift detection ("is there something not on the list?") | binary classification | ✅ |
| Attribute *discovery* (open set) | discovery | ❌ |
| Attribute *clustering* | discovery | ❌ |

**Observed in the live probe (23 October 2026, `apps/worker/src/perception/__fixtures__/jev-live-probe.json`).**
- Each `choice` answer carries `type`, `choice`, `confidence` and `probabilities`. `confidence` is not the top
  probability, and is stored on every verdict but not used until it is calibrated against the gate.
- The response echoes `model`. A model other than the pinned one is treated as a failed call.
- **One malformed question rejects the whole request** (422): the `score` criteria in the probe were sent as an
  object where Jev wants a list. For the perception job, one bad fact question sinks that run's entire call; the
  3-failures-then-set-aside path makes it safe but wasteful. Fact question text should be validated before it
  reaches a call.

**Prompting cannot make discovery closed.** Discovery means the vocabulary comes from the
answers; a prompt controls what we ask the engines, not what words appear in what they say
back. A prompt portfolio buys **recall** — surfacing attributes that generic prompts never
elicit — which is real and worth building, but it is prompt design, not a solution to the
open-set problem.

**This is why the design is shaped the way it is.** Every discovery-shaped requirement was
converted into a classification-shaped one, plus a cheap metric that tells us when the
classification is failing. Discovery then runs only over the passages the classifier could
not place — a few hundred, not the whole corpus.

That conversion is the same move the upstream author already made: #11 is written as
*ratings* (overall, pricing, quality, support), not as discovery. Faced with the same
problem, he redefined it into the shape his existing judge handles rather than reaching for
a second model.

---

## 6. Why attributes do not collide with upstream #11

An earlier recommendation was to hold on attributes entirely, because elmo's open issue #11
plans "attributes" and building our own would mean permanent divergence. That recommendation
was technically sound and strategically wrong, for one reason:

**#11 is a global standard rating set** — overall, pricing, quality, support — identical for
every brand. **Ours is a per-brand configurable taxonomy**, chosen at onboarding, maximum 10,
with the brand's own vocabulary.

Those are different data models, not competing implementations of one. A
`perception_attributes` table keyed on `brand_id` does not conflict with a global ratings
column; if elmo ships #11, the two coexist.

The collision risk was real for the earlier design — a taxonomy shipped as a versioned data
file, the same for everyone, which is approximately what #11 describes. It is low for this one.

Also material: #11 has had **no commit, branch, PR or substantive comment since its 2025
body**. Its last comment, in May, was a sentiment plan that has since shipped as Jev. Holding
the core of the product for a backlog item with no movement in a year is not caution, it is
paralysis.

**Still an open decision, and it is a business one:** contributor or competitor. If
contributor, propose this schema upstream to #11 and the divergence disappears. If
competitor, keep it and own it. The code cannot settle this.

---

## 7. The three onboarding traps

### 7.1 Failover — wrapped, not fixed

See §2, "the one genuine defect". Our proposal path implements its own fallback chain around
the resolver rather than editing it: try the resolved provider, fall through on failure,
degrade to a seeded category list. Off the hot path, nobody waiting, no divergence.

### 7.2 Onboarding research is not saved

The brand research output is not persisted today. Persisting it needs one new table plus a
one-line edit in `analyze-brand.ts` — which is a second divergence, and therefore a decision
rather than a detail. Alternative: re-run the research for attribute proposal and accept the
duplicate cost.

### 7.3 The model is hard-coded, the variable selects a provider

`ONBOARDING_LLM_TARGET` is parsed like a `SCRAPE_TARGETS` entry, but **only the provider part
is used** — the model is hard-coded per provider in `DEFAULT_RESEARCH_MODEL`. So "use a
stronger model for attribute proposal" means adding a second constant, not setting a variable.

`PERCEPTION_LLM_TARGET`, if added, should default to `ONBOARDING_LLM_TARGET` when unset —
one variable to set in practice, separable later. Credentials resolve through `getCredential`;
DB-stored credentials take precedence over `process.env` and refresh every 60s. **Reuse that
resolver. Do not invent a parallel path to the provider key.**

### 7.4 Research calls report no token usage

Elmo's research providers return only `{ object, modelVersion }`. The OpenRouter
implementation (`runStructuredResearch` in `providers/registry/openrouter.ts`) reads the
response's content and drops its `usage` block, so neither input nor output tokens reach the
caller. Every cost figure we derive for a research call (the fact proposer's, and any
per-brand estimate that includes it) is an estimate from page size and published prices,
not a measurement. The only measured figure is the OpenRouter key's usage endpoint, which
lags by seconds and can't attribute spend to one call when other calls run at the same
time. We don't edit the provider (§2). Our estimates state this blindness. Recovering usage
would need a provider change, which is a separate decision. (Found in the 1.4 proposer
dogfood, 2026-10-23.)

### 7.5 The page reader keeps 200 lines

`getWebsiteExcerpt` (`packages/lib/src/website-excerpt.ts`, elmo's) cuts every page to its first
200 lines (`MAX_EXCERPT_LINES`). That suits onboarding's "what does this brand do" read, but a
long pricing page states its later facts below the cut. In the dogfood, Supabase's $10 Pro
compute credit (F09) was never seen for that reason. It will happen again on any pricing page
with a long comparison table. We don't edit the reader (§2). If it matters, our proposer
gets its own reader with a larger budget per target page, a decision taken on evidence of
missed facts. Until then, the user fills the gap by hand.

---

## 8. Design decisions worth remembering, and why

| Decision | Why | What the alternative cost |
|---|---|---|
| **Reuse elmo's prompts table** | The execution machinery — scheduler, retries, quota, provider rotation, extraction — only runs for rows in `prompts`. A parallel table means rebuilding all of it. | A second product, not a feature |
| **Side table for class, not `system_tags`** | Five writers overwrite that column, one of them a worker pass on every brand at every start. | The marker wiped within minutes |
| **Not user `tags` either** | Users can delete them. | Perception prompts silently joining the headline metrics |
| **Exclusion at headline call sites, not in `resolveFilteredPrompts`** | That function also scopes Responses, and through `resolveScope` it scopes Citations REST/MCP and Fan-Out. | Stripping exactly the evidence surfaces perception needs |
| **Exclusion is the default; evidence surfaces opt in** | Any headline page added upstream later excludes perception automatically. | An audit every catch-up |
| **Our own text extraction via `extractRun`** | Elmo writes text and citations only after Jev succeeds, in one transaction. | Perception going dark whenever sentiment does |
| **Job inside elmo's worker, one line** | A separate process needs `compose.ts`, a Docker target, a published image, more connections, another container for self-hosters. | More deployment surface than the edit saves |
| **Drift as its own question** | Inside a per-attribute question, `not_discussed` already absorbs everything else, so `other` there is noise. | A metric that measures nothing |
| **Propose 12–15, keep 10** | Selecting is cheaper and more accurate than authoring; rejects are signal. | Users accepting a generic list they did not choose |
| **Rename kept, not removed** | The opaque key makes rename free. Removing it pushes users to drop-and-add, which genuinely orphans history. | The destructive path becoming the only path |
| **Prominence from `run_mentions`, not rollups** | Competitor-set changes re-rank the last 90 days; per-answer data can be recomputed, pre-aggregated data cannot. | Trends stepping with no marker and no way back |
| **Self-hosted first** | Perception runs consume the org ceiling and the prompt pool, and a downgrade silently evicts the customer's own prompts. | A support incident with no screen explaining it |
| **Our own prompt cap, not a judge pause** | Text, citations and judgements share one transaction after Jev succeeds; every read needs a judged row, so a pause switch is an outage. Capping what we enable is the controllable lever. | A spend cap that breaks the product |
| **Wrap, don't fix** | Every change to a shipped metric is a trust event for every operator running elmo. | Imposing a re-judge of other people's history to improve our views |

---

## 9. Open questions

**Blocking a phase:**

- **Contributor or competitor** (§6). Decides whether the attribute schema goes upstream.
  Phase 1.5 can start either way, but the answer changes what gets built on top of it.
- **Cloud pricing for perception prompts** — add-on, inside the plan count, or absorbed.
  Blocks cloud availability, not the build.

**Blocking nothing, worth closing early:**

- Does Jev offer a free-text or extraction question type? (ask TypeSafe)
- Per-question or per-token pricing? (the probe partly answers this)
- Does the real response carry `confidence`, `type`, `model`? (the probe answers this)
- Is `entities` present in SearchAPI and direct-API payloads, or cloro-only?
- Real N — attributes per mention — needs real answer text at volume.
- Does persisting onboarding research justify a second divergence? (§7.2)

**Deliberately deferred:**

- Objection classification. Designed, shelved; it rides the same machinery as facts and can
  be added once Phase 1's gate has passed.
- Per-competitor attribute sentiment (§4).
- Head-to-head positioning pairs — cost grows n².
- Cross-customer benchmarks and any global attribute catalogue.

---

## 10. Inherited discipline worth keeping

From the craft audit of the upstream build. These are the decisions that made this clone
worth building on, and the same reasoning applies to everything added here.

- **Store the raw payload before parsing.** `prompt_runs.raw_output` holds the whole response.
  This is the only reason perception can be built at all without re-scraping — and it is why
  `entities` is sitting there waiting to be read.
- **`retryLimit: 0` on anything that spends money.** The scrape lane cannot retry freely.
  Our enrichment lane can. Keep the two policies visibly separate.
- **Reproducible weak metrics beat irreproducible strong ones.** Mention detection is a
  case-insensitive substring match, deliberately. Document every perception formula, its
  denominator, its normalisation and its missing-data handling — and never copy a competitor's
  displayed score without defining your own.
- **Metric changes are trust events.** When a number moves, the changelog says whether
  reality changed or the definition did.
- **Explicit negative constraints.** Opportunities is forbidden from reading the customer's
  own pages. Attribute proposal honours the same boundary by choice — deriving attributes
  from a brand's marketing copy measures whether AI repeats their positioning, not what the
  market says. **Fact proposal deliberately does the opposite, and that is not an
  inconsistency.** Attributes ask what the market thinks, so the brand's own copy would bias
  the answer. Facts ask what is true, and the brand's own pricing page, docs and integrations
  list are the authoritative source for that. So the fact proposer reads the brand's own
  site. Every proposal carries the URL it came from, when that page was read and a quote
  from it, and the user still confirms or supplies the correct statement. Nothing is
  accepted automatically. (Decided 2026-10-23, Phase 1.4; SPEC §5.5.)
- **The install path is part of the product.** Perception ships default-off, with its cost
  stated at enable time, and does not break a self-hoster's first ten minutes.
