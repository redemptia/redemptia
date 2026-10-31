# Brand Perception — Specification

**Status:** authoritative feature spec · **Version:** 1.0 · **Date:** 22 October 2026
**Companion docs:** `EXECUTION-PLAN.md` (how it gets built), `CONSIDERATIONS.md` (rules and
traps), `UPSTREAM.md` (divergence ledger, tracked in git)
**Evidence base:** `docs/perception-recon.md` §A–K — a read-only audit of `main` at
`34c6c334`. Every claim here about existing behaviour is cited there.

---

## 1. What this feature is

Brand Perception measures **what AI says about a brand**, as distinct from **how it feels
about it**. Elmo's existing Sentiment answers "is this answer positive about Nike?".
Perception answers three questions Sentiment cannot:

1. **Which qualities does AI associate with this brand?** (association)
2. **When AI is asked about a quality, does this brand get named, and how early?**
   (market prominence)
3. **Does what AI says about this brand match the truth?** (fact verification)

The product insight is the **gap** between 1 and 2. A model may describe Gymshark as
"fitness-focused" when asked about Gymshark, and never mention Gymshark when asked which
athleisure brands are strongest on fitness. That gap is invisible to every existing metric
in the platform.

### Worked example of why sentiment is insufficient

From a real elmo demo answer, "Best kids' athletic shoes for growing feet" (recon §I6):
Sentiment scores Nike **Positive**. The answer says Nike is the "best *affordable* everyday
option… sensible **if your child has average-width feet**", and the closing line —
"The New Balance, Saucony, and Stride Rite options are especially worth comparing if comfort
and fit matter more than brand trends" — leaves Nike off the shortlist that decides the
purchase.

Positive sentiment, lost sale. Perception captures this as: attribute `fit` →
`not_discussed`/`negative`, attribute `price` → `positive`, and a prominence score where
Nike ranks behind three rivals. That is the feature in one example.

---

## 2. Scope

### In scope for v1

| # | Capability | Phase |
|---|---|---|
| A | Fact verification against user-supplied ground truth | 1 |
| B | Per-brand attribute taxonomy, max 10, LLM-proposed and user-confirmed | 1.5 |
| C | Association scoring — how AI describes the brand when asked directly | 1.5 |
| D | Taxonomy drift detection | 1.5 |
| E | Market prominence — competitive positioning per attribute | 2 |
| F | Evidence and source tracing for every figure | all |

### Explicitly out of scope for v1

- **Open-set attribute discovery.** Discovery runs only over the drift bucket, in Phase 3,
  and only when the review queue proves the hand-picked list is insufficient.
- **Per-competitor attribute sentiment** ("the market says Lululemon is *good* on
  community, not just that it's named first"). A real third metric; priced separately
  later, not folded into Phase 2.
- **Cross-customer benchmarks.** No global attribute catalogue in v1.
- **Objection classification.** Designed in earlier drafts, deferred — it rides the same
  machinery as facts and can be added after Phase 1 proves the calibration gate.
- **Cloud availability.** Self-hosted, local and whitelabel only until perception prompts
  are priced (see §9).

---

## 3. The three prompt classes

Perception prompts are **ordinary rows in elmo's `prompts` table**. They are scraped,
scheduled, retried and extracted by the machinery that already exists. What makes them
perception prompts is a row in our own side table.

| Class | Example | Measures | Our Jev questions |
|---|---|---|---|
| `association` | "What is [Brand] known for?" | prompted perception — what the model says when asked directly | 12 (10 attributes + drift + evidence), brand subject only |
| `market` | "Which [industry] brands are strongest on [attribute]?" | volunteered perception — who gets named, and how early | **0** — prominence is derived from mentions and position |
| `fact` | "What does [Brand] cost?" / "Does [Brand] integrate with Salesforce?" | concrete claims to verify | 1 per applicable fact + 1 evidence |

**Never averaged together.** Association is reputation; market is competitive reality; they
move independently, and a blended score hides both.

### Class storage

```sql
perception_prompts (
  prompt_id   uuid primary key references prompts(id) on delete cascade,
  class       text not null,         -- association | market | fact
  attribute_key text null,           -- market prompts: which attribute this prompt elicits
  created_at  timestamptz not null default now()
)
```

Class **must not** live in `prompts.system_tags` — five writers overwrite that column with
`computeSystemTags`, which only ever returns `["branded"]` or `["unbranded"]`, and a worker
pass runs on every brand at every worker start (recon §A5). A tag written there is wiped
within minutes. It must not live in user `tags` either: users can delete those, which would
silently pull perception prompts into the headline metrics (recon §A6).

---

## 4. Attributes

### 4.1 Definition flow

Attributes are defined **per brand**, maximum 10 active, when the Market set is enabled or
during onboarding.

```
1. User enables Brand Perception for a brand
2. System proposes 12–15 attributes, each paired with the market prompt that elicits it
3. User keeps up to 10, renames freely, edits prompt wording, **merges two proposals into one**, or writes their own
4. On confirm: attributes are stored, each with the market prompt **text** the user confirmed
   (`perception_attributes.market_prompt_text`). No market prompt **row** is created yet
5. Association prompts (6–10 variants) are created from a template set. The set is fixed before a
   brand's first confirm and never edited afterwards: elmo has no prompt versioning, so an edited
   template would draw one unbroken line across a change in what it asks. As built (1.7), 6
   templates, 3 of them comparison or alternatives prompts (recon §I5), none naming a competitor:
   association is brand-subject only (§5.1) and must not move when the competitor list does
```

**Prompt text now, prompt rows in Phase 2 (decided 2026-10-24).** Steps 4 and §7 once
disagreed: the user confirms each attribute together with its market prompt, but market prompts
are a Phase 2 class. Both hold because the wording and the row are different things. The
confirmed wording is stored on the attribute in Phase 1.5, because that is what the user
approved; Phase 1.5 creates association prompt rows only; Phase 2 creates one market prompt row
per active attribute from the stored text, marked by `perception_prompts.attribute_key`. Nothing
is created disabled and nothing is orphaned, and no market spend starts before Phase 2. Both
columns arrived in 0038.

Proposing 12–15 and keeping 10 is deliberate: **selecting is cheaper and more accurate than
authoring**, and the two to five a user rejects are themselves a signal about the category.

**Merge is a first-class action.** In the first dogfood run (Supabase, 23 October 2026), 2 of
15 cold-start proposals were merged rather than dropped (`lock_in` into `self_host`,
`reliability` into `scale`): a cold start over-splits related concepts, and the dropped half
often carries signal worth keeping. A merge produces one attribute with a rewritten
`question_text` covering both, and one market prompt. **A merged question stays at two clauses
at most:** a four-state verdict over three clauses is unanswerable, and labeller and judge then
disagree for reasons unrelated to accuracy. The merge UI enforces this, or at least warns.

**What an attribute may be (decided 2026-10-24, same status as atomicity for facts).**
- **A neutral dimension, never a failure state.** The four states assume a dimension where both
  poles mean something: `positive` on "free project pausing" is incoherent, and the score built on
  it can't be read. Name the dimension ("reliability of projects that stay online"), not the
  complaint. A proposal's quote may be a complaint; its label and question may not. The proposer
  is told this, and screening drops a label or quality that names a failure state
  (`failureStateProblem` in `packages/lib/src/perception/attribute-question.ts`). Warm start needs
  this most: it inherits the answers' framing, which is often a complaint. Cold-start capability
  vocabulary is naturally neutral.
- **Two qualities at most.** Proposals joining three are dropped; a merge or a user's own question
  joining three is warned about.

**Finding (2026-10-26, from labelling the calibration corpus): two qualities are unanswerable too,
whenever an answer splits on them.** The frozen `dx` attribute asks about "ease of getting started and
day-to-day developer experience". An answer that criticises day-to-day developer experience at five
friction points and says nothing about getting started has no clean four-state verdict: the label
depends on which half the labeller weights. So the proposer and the merge UI should prefer **one quality
per attribute**, and join two only where the qualities move together (an answer that judges one almost
always judges the other the same way). The corpus is frozen and keeps this item as a known limitation.
A disagreement on a two-quality item is a question-design problem first, and is reported apart from the
others. As built (1.7), screening counts an "and" inside a quality as one quality and warns only at
three, the proposer's prompt allows "never more than two joined by 'and'", and a merge always joins
two. Changing that is a prompt and screening fix for after the gate.

Each proposal arrives as a **pair** — the attribute and the market prompt that would elicit
it — because the prompt is how a user judges whether the attribute is real. An attribute
whose prompt reads awkwardly is usually a bad attribute.

### 4.2 Proposal grounding

**Warm start** — the brand already has tracked prompts and answers. Propose from real
answer text in `run_extractions`; roughly 60k characters is a representative sample
(recon §K4a). This is the drift technique applied at t=0, and it is the only grounding that
reflects what models actually say about this brand today rather than what a model believes
about the category.

**Warm start, as built (1.7):** at least 15 answers across at least 5 prompts, else cold. Answers
to fact prompts are left out of the sample: those prompts are written to draw out facts, which come
back as attributes ("Open source", quoted from "Yes, Supabase is open source"). The sample takes
one answer per prompt in turn, each prompt starting at a different model. Shown proposals take one
theme at a time, at most 2 per theme, with the rest under "Show more": a warm sample's loudest
topics otherwise fill the list (8 of 15 slots on pricing and openness in the Checkpoint 6 run).

**Cold start** — new brand, no runs. Propose from brand name, website, aliases, domains,
competitor list and industry, via `runStructuredCompletionPrompt` and its default research
model (recon §K4c). Label these in the UI as a starting guess; the drift question corrects
them within two to three weeks.

**The customer's own marketing copy is not used.** The code permits it — onboarding already
reads the brand's site, and the "don't read customer pages" rule is Opportunities' prompt
wording rather than an enforced constraint (recon §K4d) — but deriving attributes from a
brand's own positioning measures whether AI repeats their marketing, not what the market
says. That is a different and much less useful product.

### 4.3 Storage

```sql
perception_attributes (
  id               uuid primary key,
  brand_id         uuid not null references brands(id) on delete cascade,
  key              text not null,     -- opaque, immutable, never shown, never reused
  label            text not null,     -- user-editable display name
  question_text    text not null,     -- the Jev question; versioned
  question_version int  not null default 1,
  market_prompt_text text not null,   -- the market prompt the user confirmed; Phase 2 creates its row
  retired_at       timestamptz null,  -- null = active
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (brand_id, key)
)
```

The key/label split is the whole reason this feature does not accumulate history bugs.

| Operation | Effect on history |
|---|---|
| **Rename `label`** | None. All history keys on `key`. Rename never touches `question_text`, and the editor states this. |
| **Edit `question_text`** | Increments `question_version`, starting a **new series**. Charts segment at the boundary and annotate it; they never average across versions. |
| **Retire** | Sets `retired_at`. The attribute leaves the heatmap and radar; drill-down and historical views keep it. |
| **Add** | New key. Starts with no history, shown as such. |
| **Merge** | The kept attribute takes the merged question (a question edit: new version, new series) and market prompt text; the other is retired. Both histories stay. No lineage column. |

**Enforced in the database** (0038, hand-written trigger): `id`, `brand_id`, `key` and
`created_at` never change; `question_text` changes exactly when `question_version` rises by one;
a `perception_attribute_versions` row is never updated. `label`, `retired_at` and
`market_prompt_text` are free. Deleting an attribute still cascades to its verdicts; nothing
deletes one (retire is the only removal), and keys are random, so none is reused.

**Rename is kept, deliberately.** Removing it would not protect history — it would force
users who dislike the LLM's wording into drop-and-add, which mints a new key and genuinely
orphans the old series. Renaming is free precisely because the opaque key exists.

The semantic-drift risk ("pricing" renamed to "value for money", meaning something
different) is handled by the field separation: `label` does not reach the judge. Changing
meaning requires editing `question_text`, which versions.

---

## 5. Measurement

### 5.1 Association

One Jev call per association answer, **brand subject only** — competitors are not the
subject of a brand-focused prompt.

**Questions:** one per active attribute (max 10), plus one drift question, plus one evidence
question. **12 total.** Today's elmo maximum is 22 in a single call (brand + 10 competitors
× 2 questions, recon §B5), so the count is comfortable.

**Attribute option set:**

```
positive | negative | mixed | not_discussed
```

`not_discussed` is the common case and carries no signal.

**Association score, per attribute:**

```
association(attribute) = 100 × (positive + mixed/2) / (positive + negative + mixed)
```

Denominator is answers where the attribute was discussed — `not_discussed` is excluded and
reported separately as **coverage**. Hidden below n=10.

**As built (1.9).** The judge job (`apps/worker/src/perception/judge-runs.ts`) scans association runs
alongside fact runs, in the same window and under the same daily call ceiling and stamp; adding the
association path changed no fact question, so `PERCEPTION_VERSION` stayed at 2 and no fact verdict was
re-judged. An association answer is judged **once**, against the attributes active when it is judged:
an added attribute or a new question version applies to answers judged after it, and only a new stamp
re-judges the window. That is what makes drift readable: the set its "none of these" refers to is
exactly the attribute verdicts stored on the same run. Questions: one four-state question per active
attribute (`question_text` with the brand's name, PROCEDURE.md §5's criteria, no `other`), the drift
question listing those qualities (`yes`/`no`), and the drift passage, chosen from sentences naming the
brand and kept only on `yes`. Retired attributes aren't asked; a brand with no active attribute, or with
perception off, isn't scanned.

**Verdicts exist only inside the scan window (decided 2026-10-24).** The association path reuses
the fact path's scan and its `LOOKBACK_DAYS` (30, `apps/worker/src/perception/judge-runs.ts`): one
rule for both classes, no bound anchored to the first confirm. A second bound would re-judge back to
the first confirm on every stamp change, at a cost that keeps growing. So answers older than 30 days
when they are first scanned are never judged, and a brand's first weeks of association figures are
thin by design. The readout says so in words ("association figures build up over the first weeks
after attributes are saved") rather than showing empty bars that look broken. Attributes are
confirmed on the dogfood brand only once 1.9 is in.

### 5.2 Drift — the discovery engine that costs nothing

One question per subject per answer:

> "Does this answer describe a quality of [subject] that none of the listed attributes
> covers?" → `yes | no`, plus an evidence passage when `yes`.

The yes-rate is a **taxonomy-staleness metric**. It is displayed from day one. No automated
threshold until a real distribution has been observed — at launch volume there will be a
few hundred `yes` passages, and they should be read by eye.

`yes` passages go to a **review queue** and to prompt drill-down. They never enter the
heatmap, the radar or any score.

**Why this is a separate question rather than an `other` option.** Inside a per-attribute
question ("how does this answer treat *pricing* for Gymshark?"), `not_discussed` already
absorbs everything that is not pricing. An `other` option there has no distinct meaning and
its rate would be noise. One question per subject costs a tenth as much, yields the actual
passages, and produces a clean metric.

**It must be rolled up and displayed.** Elmo captures the analogous signal today —
`other_meaning`, `other_company`, `no_info` — and discards it: those verdicts collapse to
`mentioned: false` with a `reason`, and nothing in the codebase ever reads `.reason`
(recon §2 of the sentiment trace). Capturing drift and not surfacing it reproduces that dead
end exactly.

### 5.3 Market prominence

**No Jev questions of ours.** The attribute is encoded in the prompt — "which athleisure
brands are strongest on fitness?" — so the measurement is *which brands get named, and how
early*, which elmo already computes as mentions and position.

**Formula**, computed from `run_mentions` per answer:

```
prominence(brand, attribute) = 100 × mean over judged answers of ( mentioned ? 1/position : 0 )
```

Displayed with **both components beside it** — mention rate, and mean position when
mentioned — because "named rarely but first" and "named often but fourth" are different
stories that a single score collapses. Hidden below n=10 answers.

Peec's own definition is unverified. Ours is documented and reproducible, which is the
standard elmo's README already sets for every metric in the platform.

**Competitor-set sensitivity.** Position ranks only tracked brands the answer names. Adding
or removing a competitor re-ranks the last 90 days and leaves older answers on the old
ranking, with no marker (recon §K1c). Therefore:

- Every prominence datapoint records a **competitor-set fingerprint**.
- Charts segment at a fingerprint change and annotate it.
- The heatmap states which competitor set it is measured against.
- Reading per-answer rather than from pre-aggregated rollups is what makes recomputation
  possible when the set changes.

**Prominence depends on elmo's judge.** `run_mentions` is written only when Jev succeeds
(recon §K1e). Unlike association and fact verification — which extract their own text and
survive a judge outage (§8) — the market half goes dark if judging fails or is paused. This
is a stated limitation, not a bug to work around.

### 5.4 The gap

```
gap(attribute) = association(attribute) − prominence(attribute)
```

A large positive gap means AI describes the brand with this quality but does not recommend
it for that quality. That is the single most actionable number the feature produces, and it
exists only because association and prominence are measured separately.

Shown only where both sides clear n=10.

### 5.5 Fact verification

Ground truth is supplied by the user. The research LLM may propose candidate facts and the
buyer-style questions that would elicit them; the user accepts, edits, or writes their own,
and **must supply the correct statement** — the system never invents ground truth.

**Principle: an incomplete fact is worse than no fact, because it manufactures contradictions.**
"Supabase is HIPAA compliant" is true as far as it goes. Accepted as ground truth, though, it
marks a correct answer ("HIPAA requires the Team plan") as contradicting the brand. The AI is
right, and we accuse it of being wrong. That is the false positive the gate's 0-of-125 result
was meant to rule out, arriving through ground truth instead of through the judge. So:
- the proposer states a claim with every condition the page attaches to it (plan, add-on,
  region, deployment), and when two candidates describe the same thing at different precision,
  it proposes the more qualified one;
- candidates about the same topic are shown together, so the user sees the nuance before
  accepting either;
- the facts page says, in a line, that a fact must carry its conditions.

**Atomic statements, compound quotes.** Where the page's sentence is compound, the proposer
proposes its atomic core and quotes the whole sentence. "Install and run your own Supabase on
your computer, server, or cloud infrastructure" yields "Supabase can be self-hosted". A
statement that may still hold two claims is shown with the same note the editor gives, never
dropped: the dropped ones are the deployment facts AI most often gets wrong.

**Every fact can carry its source, and a suggested fact always does:** the page, when it was
read, and the quote. It is stored with the fact (0036), immutable like the rest of the row, so a
re-read is a new version. The source is what a contradiction alert cites ("here is our source,
read on this date"), and what the user re-checks when a fact may have gone stale. Hand-written
facts may have none; the editor invites one.

**Fact proposal reads the brand's own site, unlike attribute proposal (§4.2).** This is
deliberate. Attributes measure what the market thinks, which the brand's positioning would
bias. Facts are about what is true, and the brand's pricing page, docs and integrations list
are where that is written down. So the proposer reads the home page and the pages most likely
to state checkable facts: pricing, integrations, docs, deployment, security and features.
It proposes 12–15 atomic facts, each paired with the buyer-style prompt that would elicit it.
Each proposal carries its source URL, the time that page was read and a verbatim quote, and
the user sees all three while accepting.

Proposals are screened before the user sees them. A proposal is dropped when:
- its statement fails the fact rules or isn't atomic;
- its quote isn't on the page it cites;
- it repeats an existing fact.

Proposal runs only when the user clicks "Suggest facts", a button that states the cost. It
never runs from flipping the perception switch. The call wraps `resolveResearchProvider` in
our own fallback chain: the resolved provider first, then every other configured one, except
that an explicit stub target never falls through to a paid provider (CONSIDERATIONS §7.1).

```sql
brand_facts (
  id          uuid primary key,
  brand_id    uuid not null references brands(id) on delete cascade,
  statement   text not null,
  category    text null,
  valid_from  date not null,
  valid_to    date null,          -- null = currently true
  supersedes  uuid null references brand_facts(id),  -- the version this one replaced
  source_url      text null,         -- the page that states it (http/https only)
  source_read_at  timestamptz null,  -- when that page was read; set with source_url
  source_quote    text null,         -- the words that state it, from a suggestion
  created_at  timestamptz not null default now()
)
```

**Facts are atomic: one assertion per row.** "Free plan for up to 3 users" is two facts — "has a
free plan" and "the free plan covers up to 3 users". A compound fact turns a partial answer into
a judgement call; atomic facts make it `supports` for one and `not_mentioned` for the other. The
facts UI enforces or prompts for this, and the LLM fact proposer emits only atomic facts.

Facts are **immutable**. An edit creates a new row and closes the old one's `valid_to`.
Verification joins on the run's date falling between `valid_from` and `valid_to`. Mutating
a fact in place would reintroduce exactly the retroactive-contradiction problem this design
exists to avoid — a price change in March would make January's answers wrong.

**What a user can do to a fact** (built in 1.3, Checkpoint 5):

- **Record a change.** A new record starts on the change's date; the old one's last true day is
  the day before. Exactly one version is true on any day.
- **Retire.** "No longer true from" a date; the last true day is the day before.
- **Delete** — only a fact recorded by mistake: an original record (not a recorded change) that
  nothing supersedes and no answer has been judged against. Otherwise the Delete action is absent.
  A recorded change can't be deleted, because the version before it has already ended and the
  trigger lets an end date be set only once — deleting the change would leave the fact looking
  retired.
- **A fact can't be changed or retired on the day it became true**, since that day would then
  have two versions or none. A same-day mistake is fixed by deleting the fact and adding it again.
- At most 25 active facts per brand; statements are one line of 3–300 characters, assertions,
  not questions.

**Inverted question shape:** one question per fact, over the whole answer. Not "extract
claims from this answer, then match them against facts" — that requires open-set extraction.
"Does this answer support, contradict, or not mention this specific statement?" is a
closed-set question Jev answers natively.

**Option set:**

```
supports | contradicts | not_mentioned | unclear
```

`unclear` **must explicitly cover "the answer discusses this topic but does not commit"**.
Hedged claims are the common case — a real example from the demo: "Nike Revolution 7 Kids…
Around $50–$65", immediately hedged by "Prices are approximate… not guaranteed"
(recon §I6). Without that wording in the question, hedges scatter unpredictably between
`unclear` and `not_mentioned`, and the contradiction rate — the one number this feature
exists to produce — becomes noise.

**Never present an unverified claim as false.** Absence of a covering fact is not
contradiction. The UI must distinguish "we checked and AI is wrong" from "we have no fact
covering this", and the copy must never collapse the two.

### 5.6 The three fact signals, in order of product weight

Decided 23 October 2026, after the v1 corpus and the premise probe. In v1, three models with web
search made no detectable contradiction of Supabase's facts in 125 answers. In the probe, 2 of 15
ungrounded answers about recently changed facts were clearly wrong, and none of 15 grounded ones.
Contradictions are rare, concentrated in ungrounded answers about recent changes, and severe when
they occur.

1. **Coverage is the headline.** It comes from `not_mentioned` and `unclear`: "AI can't state your
   pricing", "AI doesn't know you're self-hostable". It is frequent and steady, and it moves when
   the customer acts. Shown per fact as the share of answers that state the fact, with n and its
   denominator.
2. **Contradictions are a high-severity alert, never a rate.** Each is shown individually, with its
   passage, model, date and source. One "Redis 8 is not open source" that fails a procurement review
   is worth more than a percentage. The "answers that contradict your facts" view stays, but it is
   not the headline number.
3. **Grounding sits beside every verdict.** Errors live in ungrounded answers, and grounding comes
   from sources. So for each verdict: did the answer cite anything, and did it cite the brand's own
   source? This ties perception to the existing citation infrastructure, and it turns "AI is wrong"
   into "this answer wasn't grounded in your page", which a customer can fix.

---

## 6. Evidence

Every perception figure drills down to the passage that produced it.

### 6.1 Perception selects its own passages

Elmo selects up to three consecutive sentences starting from one that names the subject,
then asks Jev to pick the best. The three-sentence window is a deliberate recall trade-off —
one sentence loses context ("it's expensive" about what?) — but it means a passage can run
past the subject into a neighbouring competitor's. Two live examples from the demo, both
under Nike's "Praise" list (recon §I3):

- "A great alternative if you want something different from Nike. Best colorways:
  White/blue…" — praising a different shoe.
- "Nike Toddler Swoosh 1 Shoes… Stride Rite Juniper: Designed with sensory pods…" — runs
  into a rival's product.

For sentiment, where the passage is illustrative and never enters a score, that trade-off is
tolerable. For perception, where the passage *is* the evidence a user checks a verdict
against, it is not. So perception builds its own selection:

- restrict candidate passages to sentences that name the subject; or
- add a **"not about this subject"** option to the evidence question.

**As built (1.5):** the first option, plus the second. Beside each fact's verdict, the same request asks
which passage the verdict rests on. It offers up to 12 of the answer's sentences that name the brand
(its name, an alias or a domain, as a whole word) and "none". The picked sentence is stored on the
verdict with the judge's own confidence in the pick (`passage_confidence`), separate from the
verdict's. An answer with no sentence naming the brand gets no evidence question. Candidates come
only from the text the judge was shown, so a shortened answer never offers a passage from the part
cut off. It costs tokens, not calls: one request per answer, as before. It changed the questions, so
`PERCEPTION_VERSION` went to 2, which re-judges the last 30 days (stub verdicts only, pre-launch).

**Attribute verdicts carry no passage (decided 2026-10-24, 1.9).** An association answer is asked
12 questions: one per active attribute, the drift question, and one evidence question, which picks the
passage for drift and is stored only when drift is `yes`. A per-attribute evidence question would make
21, and recon §K5a saw a long answer refused at 10 (`max_tokens_exceeded`). A refusal is answered by
shortening the answer, and a shortened answer changes every attribute's verdict, not only the one that
would have carried the evidence. Per-attribute evidence is a Phase 3 decision, taken if the readout
needs it.

**Elmo's selection is not modified.** A change there bumps `REQUEST_VERSION`, which re-judges
and re-bills every deployment's entire history — a cost we do not get to impose on other
operators to improve our own views. Whether to report it upstream is a separate decision.

### 6.2 Source tracing

Attributes and fact verdicts link to the URLs that fed the answer, via elmo's existing
citation extraction. The Attributes & Sources table shows: URL, URL type, domain type,
occurrences, retrievals, citation rate.

**No existing component has "retrievals" or "citation rate" columns** (recon §F2) — the
closest is `CitationsDisplay`. These columns are new.

### 6.3 Free product-level evidence

Provider `raw_output` carries an `entities` array with product names — e.g.
`{type: "product", name: "Nike Revolution 7 Kids"}` — and **nothing in the repo reads it**
(recon §I6). `extractTextFromCloro` reads only `markdown`, then `text`.

This is product-level attribution at zero model cost. Confirmed for cloro's ChatGPT answers
only; unverified elsewhere (recon §K6). **Treat as a bonus, never a dependency** — read it
where present, degrade silently where absent.

---

## 7. Data model

All new tables. Nothing existing is altered.

```sql
-- class marker (0032); attribute_key added in 0038, unused until Phase 2 creates market prompt rows
perception_prompts (prompt_id PK → prompts.id CASCADE, class, attribute_key, created_at)

-- taxonomy (§4.3)
perception_attributes (...)

-- ground truth (§5.5)
brand_facts (...)

-- every version of an attribute's question, so a chart can say what each series asked
perception_attribute_versions (attribute_id → perception_attributes CASCADE, question_version, question_text, created_at;
                               PK (attribute_id, question_version))

-- one row per (run, subject, question); the schema in packages/lib/src/db/schema-perception.ts leads this sketch
perception_verdicts (
  id uuid PK,
  run_id uuid not null references prompt_runs(id) on delete cascade,
  subject text not null,              -- brand or competitor name, as configured at judging
  kind text not null,                 -- attribute | fact | drift
  attribute_id uuid null references perception_attributes(id) on delete cascade,
  fact_id uuid null references brand_facts(id) on delete cascade,
                                      -- a check allows exactly the reference the kind needs
  question_version int null,          -- attributes only
  verdict text not null,
  probabilities jsonb not null,
  passage text null,
  stamp text not null,                -- our PERCEPTION_VERSION + observed EXTRACTOR_VERSION
  truncated_at int null,              -- answer length judged, when cut; null = whole answer
  created_at timestamptz not null default now(),
  unique nulls not distinct (run_id, subject, kind, attribute_id, fact_id, question_version, stamp)
                                      -- a re-sent job can't pay for, or store, a duplicate
)

-- association + fact + drift, DAILY UTC buckets, one row per verdict value
rollup_perception_daily (
  brand_id, day, prompt_id → prompts CASCADE, prompt_class, model, provider,
  subject, kind, ref_key (attribute key | fact id | ''), question_version (0 when none),
  stamp, verdict, answers;  PK over every column but answers
)

-- market class, DAILY buckets, migration 0041: the store for prominence over time (the heatmap for "now" stays per-answer, §K)
rollup_prominence_daily (
  brand_id, day, prompt_id, attribute_key, model, provider,
  subject_name, answers, mentioned_answers, inverse_position_sum,
  competitor_set_fingerprint
)

-- our own version stamps
perception_stamps (brand_id, layer, version, updated_at)
```

**Design rules baked into the above:**

- **All perception tables live in `packages/lib/src/db/schema-perception.ts`.** elmo's `schema.ts` is never edited.
- **A verdict records whether its answer was truncated** (`truncated_at`). A verdict over a cut answer is a different claim from one over the whole answer, and that is unrecoverable without the column.

- **Daily buckets from day one.** Elmo's 15-minute buckets barely compress at 566k rows
  (#26); attributes multiply that by N. Not negotiable.
- **Days are UTC,** and the perception page says so. Daily buckets need one fixed zone, and elmo stores none per brand (the viewer's zone is sent per request). Reversible: rollups are rebuilt from `perception_verdicts`, which keep each run's timestamp.
- **`brand_facts` is immutable in the database:** a hand-written trigger in 0033 allows only setting `valid_to` once, and `supersedes` (`ON DELETE NO ACTION`) stops a superseded fact being deleted on its own.
- **Own stamp**, not `brands.analysis_versions`. Otherwise a brand rename re-judges the
  entire perception history alongside sentiment.
- **Never write to `assessments`** — `analyze.ts` rebuilds that object in full on every
  re-judge, so any key we add is lost.
- `inverse_position_sum` and `answers` stored separately so prominence recomputes at read
  time and stays correct when buckets are combined — the same pattern elmo uses for average
  position.
- RLS enabled on every table, tenancy enforced in application code, matching the existing
  pattern. Per-run tables inherit brand through `prompt_runs.brand_id`.
- FKs cascade from `prompts` and `prompt_runs`, so deleting a prompt removes our rows too
  (recon §K2c).
- Migrations continue at **0032**. The old 0100 reservation is gone (recon §E4).
- Subject keyed on text, as `run_mentions` is — a competitor rename orphans history, the
  same known risk as sentiment (#24, #78). Alias lists are therefore part of perception
  configuration and reviewed per brand.

---

## 8. Pipeline

```
prompts (tagged via perception_prompts)
  → elmo's scheduler
  → scraper providers
  → prompt_runs.raw_output          ← written before any judging
  → [elmo's derive-runs: extraction + citations + Jev sentiment]
  → OUR JOB: scan for unprocessed runs
      ├─ extractRun(raw_output)      ← pure function, no DB, no Jev
      ├─ build questions by class
      ├─ one Jev call per answer
      ├─ write perception_verdicts
      └─ mark our rollup dirty
  → rollup_perception_daily / rollup_prominence_daily
  → perception UI
```

**Where our job lives:** inside elmo's worker, registered with one
`registerPerceptionJobs(boss)` line in `apps/worker/src/index.ts`. A separate process is not
edit-free — it would need `compose.ts`, a Docker target, a published image, more DB
connections and another container for self-hosters to run (recon §D4).

**How it finds work:** its own scan, not a hook. No hook point exists after extraction
(recon §E1). The job selects runs for perception prompts that have no verdict rows at the
current stamp.

**Judge independence.** Our job extracts its own text from `raw_output` with `extractRun` —
verified to be a pure function with no database or Jev dependency, covering every registered
provider, returning null text on failure (recon §K3). This matters because elmo writes
`run_extractions.text_content` and citations **only after Jev succeeds, in the same
transaction**, and if either half of a split call fails, nothing at all is written for that
run (recon §B4, §D2/D4). Association and fact verification therefore survive a Jev outage
that blanks elmo's own dashboards. **Market prominence does not** — it reads `run_mentions`
(§5.3).

**Length fallback.** Our job does not use `askFitting` (it is not exported, and it fires
only on Jev's 400 `max_tokens_exceeded`). On that error: **truncate the answer, keeping its
beginning, and retry. Never drop questions** — dropping questions produces partial attribute
coverage that looks like real `not_discussed` data. Cap answers at 20,000 characters
(elmo's own 50,000 cap applies to us only if we copy it, recon §K5).

**Untouched:** `analyze.ts`, `jev.ts`, `derive-runs.ts`, `analysis-versions.ts`,
`mentions.ts`, `rebuild.ts`, `assessments`, and all existing rollup tables.

---

## 9. Exclusion from headline metrics

Perception prompts must not move Visibility, Share of Voice, Position or Sentiment. They
**must** appear in Citations, Query Fan-Out and Responses, because that is the evidence
layer perception depends on.

**Default is exclusion.** Prompt lists exclude perception prompts unless a caller opts in,
so any headline page added upstream in future excludes them automatically.

| Surface | Perception prompts |
|---|---|
| Visibility, SoV, Position, Sentiment, Overview cards | **excluded** |
| Opportunities digest | **excluded** — it reads visibility and SoV |
| Prompt editor (settings) | **hidden** — users can otherwise disable or reword them (recon §K2) |
| Citations (page, REST, MCP) | included |
| Query Fan-Out (page, REST, MCP) | included |
| Responses list | included, with an explicit filter |
| REST/MCP `/analytics` summary | headline fields excluded; citation totals included — these must not be mixed in one payload without labelling (recon §K7) |

Note `resolveFilteredPrompts` **also** scopes Responses, and through `resolveScope` it
scopes Citations REST/MCP and Query Fan-Out. A single filter there would strip exactly the
surfaces perception needs — which is why the exclusion sits at the headline call sites
instead (recon §A1–A4).

---

## 10. Quota, cost and availability

**Ships on self-hosted, local and whitelabel first. Off in cloud until priced.**

Perception runs consume the org daily run ceiling *and* the plan's prompt pool, and the
oldest-first pool silently evicts newer customer prompts after a downgrade, with no screen
saying so (recon §C3). A separate quota bucket would touch up to 18 entitlement files.

**No entitlement flag in v1, by design.** The deployment-mode gate is the gate: the perception server
functions and the worker job run only in `local` and `whitelabel` (self-hosted deployments are one of
those two), and nothing in `packages/lib/src/entitlements` knows about perception. A flag arrives only
with cloud pricing, so nobody should look for one before that.

**The 100-prompts-per-brand cap applies even on self-hosted** (recon §K2d). Ten market
prompts plus association and fact prompts is a visible share of it. The attribute editor
shows remaining headroom before creating prompts.

**Cost shape:**

```
provider cost = perception_prompts × models × runs_per_day × provider_price_per_run
jev cost      = our 12 questions per association answer
              + elmo's up to 22 questions per answer of ANY class   ← the larger line
```

Market prompts are ordinary prompts, so elmo's judge runs on every market answer that names
a tracked company — up to 22 questions for a brand with 10 competitors. We do not issue that
spend, but it is **bounded by the number of perception prompts we enable**, which is capped
in code. It is a budget line to size, not an uncapped path.

Roughly $12.60 / $25.20 / $50.40 per brand per month in provider spend for 6 / 12 / 24
perception prompts at current defaults, plus the judge cost above. Default off; cost stated
at enable time.

**As built (1.4).** The switch card shows the estimate with every input beside it: the number of
fact prompts (or 10, labelled, when there are none yet), the brand's enabled models, its cadence,
`RUNS_PER_PROMPT`, the resulting answers a month, provider spend from the deployment's per-run
placeholders, elmo's judge at its published $0.15–0.35 per 1,000 answers, and our fact checks
(assumed to cost the same, not measured), plus fact checks a day against the 2,000 ceiling. Dollar
figures only in local mode, the line elmo's own cost projection draws; whitelabel and demo show the
counts without dollars.

**Cadence:** perception prompts run at the brand's cadence, because no per-prompt cadence
exists (recon §C1). Prompt count is sized to the budget rather than cadence being slowed —
adding per-prompt cadence would mean editing `policy.ts` and `process-prompt.ts`, which saw
five upstream commits last month.

---

## 11. UI

### 11.1 Navigation

One new nav item, **Perception**, between Sentiment and Citations. One route file; one line
in `app-sidebar.tsx`; `routeTree.gen.ts` regenerates (never hand-merged).

The page carries the **same filter bar** as every other analytics page — model filter
(including "All Models"), date range, tags — reusing `FilterBar` and `use-list-filters`.
Perception must feel like part of the platform, not a bolt-on.

### 11.2 Page layout, top to bottom

```
┌─────────────────────────────────────────────────────────────────────┐
│  [All Models ▾]  [Last 30 days ▾]  [Tags ▾]                         │
├─────────────────────────────────────────────────────────────────────┤
│  OVERVIEW CARDS                                                     │
│  ┌──────────────┬──────────────┬──────────────┬──────────────┐      │
│  │ Most         │ Best         │ Biggest      │ Strongest    │      │
│  │ associated   │ competitive  │ gap          │ competitor   │      │
│  │ Fitness   42 │ Influencer15 │ Fitness  −33 │ Lululemon    │      │
│  │ n=284        │ n=190        │ assoc−prom   │ 8/10 attrs   │      │
│  └──────────────┴──────────────┴──────────────┴──────────────┘      │
├──────────────────────────────┬──────────────────────────────────────┤
│  HOW AI DESCRIBES [BRAND]    │  BRAND SHAPE                         │
│  Top attributes when AI is   │  Market prominence, one axis per     │
│  asked about [Brand]         │  attribute                           │
│                              │                                      │
│  Fitness      ████████ 42    │        Community                     │
│  Authenticity ████ 20        │           ╱╲                         │
│  Contemporary ███ 18         │     ╱─────  ─────╲                   │
│  Community    ███ 18         │   Inclusivity   Fitness              │
│  Ambition     ██ 14          │                                      │
│  Influencer   ██ 12          │  ● Gymshark ● Adidas ● Nike  3/177   │
│  Innovative   █ 11           │                        [Add +]       │
│  Performance  █ 8            │                                      │
│  Coverage: 71% of 400 answers│  Competitor set: v3 (since 12 Oct)   │
├──────────────────────────────┴──────────────────────────────────────┤
│  BRAND COMPARISON BY ATTRIBUTE          [Manage attributes][Add +]  │
│  How each brand places when AI is asked about the industry.         │
│  A higher score means the brand tends to be named earlier.          │
│                                                                     │
│  Attribute    │ Gymshark │ Lululemon │ Adidas │ Nike │ Alo │ Puma   │
│  Community    │    17    │    31     │   13   │  11  │ 19  │   1    │
│  Influencer   │    15    │    18     │   13   │  11  │ 18  │   4    │
│  Authenticity │    14    │    16     │   14   │  11  │ 18  │   7    │
│  Fitness      │     9    │    25     │   34   │  25  │ 14  │  20    │
│  …                                                                  │
│  Market prominence (0–100)  0 ░1–3 ░4–7 ▒8–10 ▒11–14 ▓15–17 …      │
├─────────────────────────────────────────────────────────────────────┤
│  ATTRIBUTES & SOURCES                                               │
│  Where your brand places for each attribute, and the sources        │
│  feeding it.                               [Search attributes…]     │
│                                                                     │
│  ▸ Authenticity                          #3    [alo][lulu][adi] +9  │
│  ▾ Fitness                               #7    [adi][nike][lulu]+9  │
│    ┌──────────────────────────────┬────────┬──────────┬─────┬────┐  │
│    │ URL                          │ Type   │ Domain   │ Occ │ CR │  │
│    │ The Best Activewear Brands…  │Listicle│ Editorial│ 12  │0.7 │  │
│    │ vogue.com/article/best-…     │        │          │     │    │  │
│    │ 10 Leading Athleisure Co…    │Listicle│ Corporate│ 11  │ —  │  │
│    └──────────────────────────────┴────────┴──────────┴─────┴────┘  │
├─────────────────────────────────────────────────────────────────────┤
│  FACTS                                           [Manage facts]     │
│  How often AI states each fact (coverage)                           │
│  "Starts at $29/month"    stated 19% · unclear 6% · absent 75% n=248│
│  "Self-hostable"          stated  4% · unclear 1% · absent 95% n=248│
│                                                                     │
│  ⚠ ALERT  "Pricing begins around $49…"  contradicts "Starts at $29" │
│    ChatGPT · 18 Oct · no citation · [view answer]                   │
│  Grounding: 12% of answers cite your pricing page                   │
├─────────────────────────────────────────────────────────────────────┤
│  REVIEW QUEUE                                      12% drift ⓘ      │
│  Qualities AI mentions that your attributes don't cover             │
│  "…known for its rapid shipping and hassle-free returns"  ×7        │
│  "…frequently criticised for inconsistent sizing"         ×4        │
│                                    [Add as attribute] [Dismiss]     │
└─────────────────────────────────────────────────────────────────────┘
```

**As built (1.5), the facts part of this layout:** a Perception page in the Dashboard group,
with the same filter bar (model, date range, tags), in UTC days. Two cards:
- **How often AI states your facts.** One row per fact: stated, unclear and not mentioned as
  shares of the answers judged against it (n named), contradictions as a count pointing at
  their alerts, and grounding (any source, the brand's site, the fact's source page). Hidden
  below 10 answers.
- **Answers that contradict your facts.** One alert each, newest first: the passage, the fact,
  the model, the date, whether the answer cited anything (and whose), our source with its
  read date, and a link to that prompt's answers.

Each answer counts once per fact, from its latest verdict, so a judge-version change never
double-counts. The readouts read verdicts and `run_mentions` directly; they do not read the rollups.

**What the rollups are for (decided 2026-10-31).** `rollup_perception_daily` and `rollup_prominence_daily`
are not a cache for the current readouts. They are the store for change over time. Per-answer queries
answer "what is true now" over the lookback window and stay per-answer (§K: the heatmap needs detail
a daily sum can't carry, and recomputes when the competitor set changes). The rollups answer "what
changed over months", which per-answer data over a bounded window cannot. The consumer is the history
surface, not the existing readouts. The perception job rebuilds `rollup_perception_daily` from the days
it marks dirty; its rows split by judge stamp and carry no grounding, which is why it can't stand in for
"latest verdict per answer"; the history surface resolves the stamp per day (see its design).

**What the judge reads: the raw extracted text (decided 2026-10-31).** Fact verification judges the answer
exactly as `extractRun` returns it, with link targets, citation markers and inline data left in. Elmo's own
mention judge cleans the text first; ours deliberately does not. The calibration gate (PROCEDURE.md) was
measured on raw text, and fact verification is what ships, so changing the input would invalidate the only
validation there is. First thing to revisit if real-run judge accuracy disappoints: judge cleaned text and
re-run the gate on it. Passage *selection* ignores link targets and bare URLs, so a name hiding in a URL is
never offered as evidence; that doesn't change what the judge reads.

**History surface (built 2026-10-31).** "Perception History" charts fact coverage from
`rollup_perception_daily` and, from `rollup_prominence_daily`, the brand's mention share and average
position per day. A day uses one judge version (facts) or one competitor set (market): the one covering
the most answers, a real judge's stamp over the stub's on a tie. Days under 10 answers are gaps; each
series starts on its first day of data and never draws before it. `rollup_prominence_daily` stores
counts (answers, mentioned, positioned, position sum, inverse-position sum) per (brand, day, prompt,
model, provider, subject, competitor-set fingerprint), so §K's "recompute when the set changes" still
holds for "now" while the rollup serves "over time". Market answers get no dirty marker (elmo's judge
writes their mentions), so the prominence job rebuilds today and yesterday each run, any day with market
answers and no rollup, and the whole 90-day window once a UTC day.

**For 1.10 (decided 2026-10-24): association leads with coverage, as facts do.** In the attribute
half of the calibration corpus, 345 of 450 (attribute, answer) items were `not_discussed` and 16 were
`negative` (AI labels, before validation). That is a product finding, not a corpus problem: the
association-side version of the fact reframe, where coverage is the signal. The association readout
leads with **coverage per attribute** (the share of answers that characterise the brand on it, with n),
and the association score sits beside it. The attribute question is not tuned to surface more
negatives.

### 11.3 Component reuse

| Need | Reuse | Status |
|---|---|---|
| Model filter, date range | `FilterBar`, `ALL_MODELS_VALUE`, `use-list-filters` | exists |
| List shell | `filtered-list-shell.tsx` | exists |
| Source table | `CitationsDisplay`, `components/citations/*` | exists; **occurrences / retrievals / citation-rate columns are new** |
| Evidence passage panel | `Quotes`, `QuoteRow` in `sentiment.tsx` | **file-local, not exported** — copy, or export (an edit) |
| Markdown rendering | `InlineMarkdown`, `ResponseMarkdown` | exists |
| Radar chart | `recharts` `RadarChart` | **dependency already installed**, unused today — no new dep |
| Heatmap | none | new — a styled grid or table |
| Settings page pattern | the competitors settings page | copy this for attribute and fact editors |
| Editable table | none | the prompts list editor is the closest pattern |

### 11.4 Display rules — enforced, not advisory

These are **our** standard for **our** views. Elmo's pages do several of these differently,
which is a defensible position for a product whose README promises every metric is readable
and verifiable in-repo — showing the raw number on n=2 is consistent with that promise.
Perception takes the opposite view because a perception verdict is a claim about a brand that
a user will act on, and a claim built on two mentions should not be made at all.

Existing pages are not changed to match.

1. **Sample size beside every figure.** For reference, the demo ranks a prompt scoring 100 on
   **2 mentions** in the same table as one with 280 (recon §I2).
2. **Hide below n=10.** Not grey, not asterisked — absent, with "not enough data yet".
3. **One denominator per metric, named in the label.** Different views may legitimately use
   different denominators — a ring carrying forward each prompt's latest day is not the same
   question as a table summing a period — but the label must say which. "84% positive across
   7,571 answers" where 84% is 4,236/5,060 *mentions* is the shape to avoid (recon §I1).
4. **Coverage shown next to every score.** The denominator is answers where the attribute
   was discussed, not answers collected.
5. **Segment at version boundaries.** Perception charts break the line and annotate it — for
   attribute `question_version` changes and for competitor-set fingerprint changes alike.
   Elmo has no prompt versioning, which is a scope decision rather than a missing guard;
   we need versioning for attributes, so we build it on our own objects.
6. **Judge-version changes marked.** When the stamp changes, say so on the chart.
7. **Unverified ≠ false.** Distinct icon, distinct colour, distinct copy.
7a. **Coverage leads, contradictions alert.** The fact view's headline is coverage. A contradiction is
    never shown as a rate or a percentage: each one is an individual alert with its passage, model,
    date and source.
7b. **Grounding beside every verdict.** Each verdict shows whether its answer cited anything, and
    whether it cited the brand's own source.
8. **Quotes must be about their subject.** §6.1.

**v1 note (2026-10-29):** Rules 5 and 6 are N/A in v1 — no time-series charts exist yet.
Both apply to the first perception chart that ships; the implementing PR carries them.

**Overview cards (Phase 3, 2026-10-29): two of four held.** Shipped: the brand's strongest
attribute and the strongest competitor, both from prominence alone, each with its answer and
ordering counts. Held: **most associated** and **biggest gap**. Both are association figures,
and §12 keeps the association score dark until four-state attribute agreement passes (it failed
on 2026-10-26). They ship with the association figures, not before; until then the page shows
no placeholder for them, and the heatmap says why it has no gap column.

**Downloadable audit (shipped in Phase 3, 2026-10-29).** `perception-audit.ts` assembles a
JSON snapshot of prominence, fact readout, sources, stamps and the competitor-set fingerprint,
downloadable from the perception page. Originally deferred from Phase 3; built early because
the stamps and fingerprints were already wired.

---

## 12. Accuracy gate

**No perception figure is shown to any user until the gate passes.** Zero accuracy evidence
exists today — every claim about Jev's response shape comes from our client's TypeScript
types, not a captured payload, and the test suite uses synthetic stand-ins.

This gate is ours. It is not a judgement about elmo's sentiment accuracy, which is a shipped,
observable product with its own evidence; it is a bar for a new classifier making new claims.

**Calibration corpus:** real answers per brand, blind-labelled per (fact, whole answer) and per
(attribute, whole answer), each with the deciding passage marked — the judge sees the whole
answer, so the label is for the whole answer. Procedure:
`apps/worker/src/perception/calibration/PROCEDURE.md`.

**Bar:** `contradicts` precision ≥ 0.85 **and** its lower 95% (Wilson) bound ≥ 0.75, and recall
≥ 0.70 on the same basis, before any fact verdict is displayed. Natural and enriched
(perturbed) results are reported separately. Attributes get an equivalent bar set once the corpus exists.

**The attribute fallback, fixed 2026-10-26 before the version 2 rerun.** Attribute figures rest on
two different label boundaries, so they are gated per figure (rule 10 of CONSIDERATIONS applies per
figure, not per page). If the stratified cross-model check of the version 2 labels misses 36 of 40 on
the four states, but discussed vs not discussed holds at ≥ 90% with κ ≥ 0.8:
- 1.10 ships **coverage per attribute** and the **drift rate**. Both rest only on the discussed boundary,
  which has passed twice.
- The **association score** and the **brand-shape radar** stay dark until four-state agreement passes:
  they are the figures that depend on positive, negative and mixed.

This is not a lowered bar. It ships the half that cleared its bar and holds the half that didn't, as
the 23 October fact reframe concluded on its own evidence: coverage is the product, and scores and
contradictions are the alerts beside it.

**Attribute result (2026-10-26): failed; attribute figures don't ship in v1.** Cross-model validation
(Claude against Gemini, both blind, labels sealed before comparison) on the 40 stratified items:
version 1 rules 34 of 40 (κ 0.79), version 2 rules 32 of 40 (κ 0.72), against 36 needed; discussed vs
not discussed at 90% and κ 0.79 under version 2, so the fallback above failed too. Version 2 improved the
hard diagnostic set (14 → 22 of 30) and lowered the stratified one, and the disagreements spread across
every boundary: a construct with a low reliability ceiling, not an underpowered sample. Association
score, radar, coverage per attribute and the drift rate stay dark. The association path stays built and
judging on the stub. Attributes remain as **prompt generators** for market prompts (§5.3), which need no
gate of ours. Full numbers: PROCEDURE.md §7b.

**Final for v1 (decided 2026-10-29).** The fallback was reconsidered and a 150-item binary draw
declined (PROCEDURE.md §7b: a pass is a coin flip at any n, and per-attribute coverage can't be
validated on this corpus). Attribute figures do not ship in v1, and no draw, rerun or fallback is
pending. Attributes remain prompt generators per §5.3.

**`ASSOCIATION_ENABLED` stays `false`, including through the real-key flip (decided 2026-10-30).**
Every figure the association path feeds is dark, so judging it on a real key would spend per call
on verdicts nothing displays. Do not flip it by reflex; it changes only if association returns with
a different question shape (see the constant's comment in `packages/lib/src/perception/association.ts`).

**If the gate fails, the work stops.** It does not ship with a caveat in the copy.

---

## 13. Known limitations, stated in the product

1. Prominence is relative to the configured competitor set, and re-ranks when that set
   changes. Fingerprint shown. **Evidence:** position counts only tracked brands the
   answer names (§5.3), so adding competitor C to a set {A, B} where an answer named
   A first and C second changes B's position from 2 to 3. Every answer is grouped by
   the competitor set it was judged under, and figures only combine within one set.
   **Measured:** across the 10-prompt corpus, a rough text match finds brands outside the
   configured set named ahead of Supabase — PocketBase in 15 answers, AWS Amplify 15,
   Parse 9, Nhost 6 — and none of them counts toward its position.
2. Prominence goes dark if elmo's judge fails or is paused.
3. Aliases decide what perception measures. In the demo, "Jordan 1 vs Adidas Forum" never
   names Nike — only "Air Jordan 1" — and Nike is scored Negative through the alias
   (recon §I4). Alias lists are reviewed per brand as part of perception configuration.
4. Locale is pinned to `location_code 2840` (US English), inherited from elmo. A stated
   constraint, not silent variance.
5. Comparison and "alternatives" prompts carry nearly all the signal; generic prompts return
   positive and little else (recon §I5). Prompt sets are built accordingly.
6. `entities` product attribution is cloro-only until verified elsewhere.
