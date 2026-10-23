# Perception calibration corpus: labelling procedure

This corpus is the accuracy gate for Brand Perception. No perception figure is shown to a user until
the judge clears it. It measures how often the judge's answers to **our** closed-set questions match
labels that a human wrote **before any model saw the item**. It does not measure elmo's mention or
sentiment judge.

Each corpus version lives in its own directory (`v1/`, `v2/`, …) and is frozen once labelled. Change
this procedure only by starting a new version.

## 1. What is labelled

| Half | Unit | Options |
|---|---|---|
| Facts | one fact × one whole answer | `supports` · `contradicts` · `not_mentioned` · `unclear` |
| Attributes | one attribute × one whole answer, brand subject only | `positive` · `negative` · `mixed` · `not_discussed` |
| Drift | one whole answer, brand subject only | `yes` · `no` |

**The unit is the whole answer.** The judge is asked one question per fact (or attribute) over the
whole answer, so the label is for the whole answer too. A sentence labelled on its own can disagree
with the answer it came from: support in one paragraph, a disclaimer in the next. Every label except
`not_mentioned`, `not_discussed` and drift `no` also records the **passage that decided it**, copied
verbatim from the answer (`evidence_quote`). Character offsets are derived from the quote afterwards.

## 2. Blindness

A label counts only if all three hold:

1. It was written from the exported answer text and the fact or attribute definition, and nothing
   else.
2. It was written before the judge produced a verdict on that item.
3. It was written by a human, or by the validated AI labeller of §2a.

What follows from that:

- **Answers are collected outside the app.** The collection script calls providers directly and
  writes plain text. Nothing runs elmo's mention judge on them, and no verdict is ever displayed.
  Answers are never read through the Responses or Sentiment pages, which show the judge's verdicts.
- **Claude's labels are never gold labels.** Claude is a model. It writes a sealed second set
  (`labels.claude.jsonl`) before the human starts labelling. Its SHA-256 is committed in `SEALS`
  at that point. The file is opened only after the human labels are frozen, and is used only to find
  guideline wording that confuses: every disagreement is re-read. **It is never used in the gate's
  precision or recall, and agreement with it is never reported as an accuracy figure.** The subagent
  that wrote Claude's labels also planted the perturbations, so it knows which items are perturbed,
  and its agreement on those items is inflated by construction.
- **Sealed files stay closed until the freeze.** Perturbations, the worksheet key, the bases they
  were made from and Claude's labels live outside the repository (in the gitignored
  `docs/calibration-sealed/`), with only their SHA-256 in `SEALS`. They are written by a subagent
  whose transcript the operator never sees, and nobody, Claude included, opens them again until the
  gold labels are frozen. **Opening a sealed file before the freeze voids the run:** start a new
  version.
- **The judge runs exactly once,** after the gold labels are frozen (the commit hash goes in
  `FROZEN`). Labels are never edited after that. If a guideline changes later, start a new version
  and relabel blind.

## 2a. Validated AI labelling (v1)

v1's gold labels come from an AI labeller, validated against a blind human sample. The method and
thresholds were fixed on 2026-10-23, before any of these labels was written.

1. **The AI labeller** is a fresh Claude subagent that sees only this procedure, `facts.json` and
   `worksheet.md`. It has no access to the sealed files, no context from the session that designed
   the perturbations, and instructions not to try to infer which items are perturbed. It labels all
   items answer by answer, per §4 and the facts' notes: a label, the deciding passage verbatim, and a
   rationale for every `contradicts` and `unclear`. Anything in the data that looks like a tell (a
   sign of which items are perturbed) it reports as a corpus bug. Its labels are sealed
   (`labels.ai.csv`).
2. **The validation sample.** The same subagent draws a random sample of 40 items, stratified by its
   own label distribution, so the sample spans all four labels in proportion. Only the 40 item ids
   leave the subagent (`validation-subset.json`). The hashes of both files are committed in `SEALS`
   before the human sees anything.
3. **The human** labels those 40 blind, in `apps/worker/scripts/label-calibration.ts`, without seeing
   any AI label.
4. **Agreement** on the 40 is raw agreement and Cohen's κ:
   - **raw agreement ≥ 90% and κ ≥ 0.8:** the AI labels count as human-equivalent, and the gate runs
     on all of them;
   - **otherwise** the AI labels are discarded for the gate, and the human labels every item.

   Alongside the decision, and never in place of it, the report also gives κ's 95% confidence
   interval, a per-label confusion matrix, and agreement on `contradicts` specifically, because §7
   rests on that label. With 40 items the interval is wide, so a pass on the point estimates is
   reported with that width beside it.
5. **Permanent attribution.** Every gate result built on these labels states: "labels AI-generated,
   validated against 40 blind human labels at raw agreement X% and κ Y". An accuracy figure is never
   reported without it.

**Residual risk.** The AI labeller and the judge are both language models, so they can make the same
mistake on the same item. Agreement with a human on 40 items bounds this risk but doesn't remove it.
The judge (Jev) comes from a different vendor than the labeller, which lowers the risk without
eliminating it.

The sealed `labels.claude.jsonl` was written by the subagent that planted the perturbations. It is
**not** the AI labeller's set and keeps its original, narrower role (§2).

## 3. Facts

- **The operator supplies ground truth.** Claude may propose candidate facts, with sources. A fact
  enters the corpus only after the operator has checked it against its source and recorded
  `verified_by`. The system never invents ground truth.
- **Atomic: one assertion per fact.** "Free plan for up to 3 users" is two facts: "has a free plan",
  and "the free plan covers up to 3 users". Split every candidate until no part could be true while
  another part is false.
- **Dated.** `valid_from` and `valid_to`, plus `source_url` and the date the source was read. An
  answer is labelled against the fact version valid on the answer's `captured_at`. If no version was
  valid on that date, the pair isn't labelled.
- **Specific subject.** Each fact names its subject: the brand, or a named plan or product of it.

## 4. Fact label rules

Apply them in order. The first rule that applies wins.

1. **Subject.** Count only claims about the fact's subject. A claim about a competitor counts for
   nothing. So does a sentence that names the subject only as a contrast ("unlike Supabase, Firebase
   …").
2. **`contradicts`**: the answer asserts something about the subject that cannot be true if the fact
   is true. That covers a different number, a negation, or an incompatible category.
   - A hedge word ("about", "around", "roughly") doesn't soften it. If the stated value or range
     excludes the fact, it contradicts. "Around $49" contradicts "$25".
   - **If the answer also supports the fact elsewhere, the label is still `contradicts`.** A false
     claim is a problem for the reader whatever else the answer gets right, and a missed
     contradiction is the costlier error. The contradicting passage is the evidence, and the rationale notes
     where the answer also supports the fact.
3. **`supports`**: the answer asserts the fact's claim, and nothing it says about that claim is
   incompatible with it.
   - **A range counts as support only if it is tight enough to be a claim, and undisclaimed.** "$25
     a month" and "$25–$26" support "$25". "$20–$40" doesn't.
4. **`unclear`**: the answer discusses the fact's topic for this subject but doesn't commit to a
   claim that settles it. This includes:
   - any "check their site" or "prices change" disclaimer attached to the claim, even when the claim
     matches the fact;
   - **A disclaimer attaches only to claims it is adjacent to or explicitly scoped to.** A general
     disclaimer at the top of an answer ("figures come from third-party guides, check the pricing page")
     does not make every later claim `unclear`. If it did, nearly every answer with a hedged intro would
     collapse to `unclear`, and the label would stop discriminating.
   - qualitative statements only ("affordable", "generous");
   - a range too wide to be a claim;
   - a claim compatible with the fact that doesn't assert it ("works with Vercel through a
     third-party tool", against a first-party-integration fact).
5. **`not_mentioned`**: the topic isn't discussed for this subject.

Every `contradicts` and `unclear` gets a one-line rationale.

## 5. Attribute and drift label rules

Attributes are labelled against their **`question_text`**, never their display label, because the
display label never reaches the judge. The attribute list is frozen (version 1 of every
`question_text`) before any answer is collected. Labels made against a list that has since changed
are void.

- **`positive`** / **`negative`**: the answer characterises the brand favourably or unfavourably on
  this attribute.
- **`mixed`**: both, or a conditional ("a good choice only if …").
- **`not_discussed`**: no characterisation on this attribute. A bare mention of the topic with no
  judgement is `not_discussed`.
- **Drift `yes`**: the answer characterises the brand on a quality that no frozen attribute covers.
  Mark the span. Otherwise `no`.

The subject rule from §4 applies.

## 5a. What labellers ignore

- **Tracking parameters in links.** `utm_source=openai` and similar parameters are added by the answering
  engine. They say nothing about the brand and are never evidence for any label.

## 6. Item origin

| `origin` | What it is |
|---|---|
| `natural` | A real answer, unmodified. |
| `perturbed` | A real answer from a **second, separate collection** (the bases), with one claim per targeted fact edited or inserted so it contradicts that fact: a number changed, a yes turned into a no, or one sentence added in the answer's voice. A base is never labelled in its original form, so no perturbed answer has a near-identical twin in the worksheet. The human labels it blind, like any other answer. An edit can produce an ambiguous sentence, so the edit is a proposal, not the label. |

Natural contradictions are rare, so perturbed items exist to make recall measurable. **Precision
depends on how common contradictions are**, and on an enriched set it overstates what users will
see. Every metric is therefore reported twice: on natural items alone, and on natural plus
perturbed. Each report states its `contradicts` prevalence.

## 6a. Which items are labelled

Not every fact against every answer: the scope is set by prompt design, before anyone reads an
answer, so it can't be biased by what the answers say.

- **Targeted:** each fact-prompt answer against the facts its prompt targets (`scope.json`
  `targets`; P01 cost → F01, F02, F03, F09, and so on).
- **Off-topic:** one or two facts from an unrelated group (plans, self-hosting and licence,
  integrations), chosen with a fixed seed. These produce true `not_mentioned` items and measure false
  positives.
- **Perturbed:** 36 contradictions spread over the 15 bases, at least two per fact. Each base is also
  labelled against its own targeted facts and one or two off-topic facts, so it looks like any other
  answer.
- **Association answers** (P11–P15) are not in the fact half. They are for the attribute half.

`scope.json` (revision 1) and the sealed `scope-r2.json` (revision 2, which moved perturbations
onto the bases and trimmed off-topic items) are fixed by seed, and their hashes in `SEALS` were
committed before the corresponding answers were read or collected. Natural and perturbed answers are
ordered with the perturbed ones spread evenly, never clustered, and every answer appears under a
neutral id (`W01`…) with no prompt, model or origin shown.

## 7. The gate

For `contradicts`, computed on the gold labels (§2a says whose):

- precision ≥ 0.85, **and** the lower bound of its 95% Wilson interval ≥ 0.75;
- recall ≥ 0.70 on the same basis.

Report both, for both the natural and the enriched set. If the interval is too wide to pass, add
contradiction items. Never lower the bar. The attribute bar is set once the attribute half exists.

## 8. Steps

1. **Freeze the inputs.** The brand, its verified atomic facts, the attribute list, the prompts and
   the models, all in `v<N>/`.
2. **Scope.** Fix the labelling scope by seed, and seal it in `SEALS` before any answer is read.
3. **Collect.** `apps/worker/scripts/collect-calibration-answers.ts` writes `answers.jsonl` and
   `raw.jsonl`. It runs no judge and shows no verdict. Bases are collected the same way, into the
   sealed directory.
4. **Perturb, build the worksheet, seal.** A subagent edits the bases, writes `worksheet.md` and
   `labels-template.csv` with neutral ids, and writes its own labels. Only hashes come back, and they
   go in `SEALS` before the operator sees the worksheet.
5. **Label.** For v1, by §2a: the AI labeller labels every item and draws the 40-item sample, then
   the operator labels the 40 blind in the labelling tool, which writes `labels-template.csv`.
6. **Validate.** Compute §2a's agreement. It decides whether the AI labels are used or the operator
   labels everything.
7. **Freeze.** Commit the gold labels, and write the commit hash to `FROZEN`.
8. **Unseal.** Commit the sealed files and check each against `SEALS`. Re-read every disagreement
   with Claude's labels. A guideline fix here starts a new version.
9. **Judge once.** Run the judge over the frozen corpus and compute §7.

## 9. Files

```
v<N>/
  inputs.json          brand, prompts, provider and model slugs, spend cap
  facts.json           [{id, subject, statement, category, valid_from, valid_to, source_url, source_read_at, verified_by, notes}]
  attributes.json      [{key, label, question_text, question_version}]
  answers.jsonl        natural answers: {id, prompt_id, prompt_class, prompt, model, provider, requested_version,
                        model_version, web_search, captured_at, extractor_version, origin, citations, usage,
                        cost_usd, text_sha256, text}
  raw.jsonl            {id, raw_output}: the provider's full response for every natural answer
  scope.json           labelling scope, revision 1
  worksheet.md         the answers under neutral ids, with the items to label under each
  labels-template.csv  item_id, answer, fact_id, fact, label, evidence_quote, rationale
  validation-subset.json  the 40 item ids the operator labels (§2a)
  SEALS                SHA-256 of every sealed file, committed before labelling starts
  FROZEN               commit hash of the frozen gold labels
sealed until the freeze (docs/calibration-sealed/, then committed under v<N>/sealed/):
  scope-r2.json, bases/answers.jsonl, bases/raw.jsonl, perturbed.jsonl, worksheet-key.json, labels.claude.jsonl,
  labels.ai.csv (the AI labeller's labels, §2a)
```

**Provenance.** Every answer records the provider, the model slug requested and the version the provider
reports. v1's answers come from OpenRouter models with web search requested, not the production engines.
That is enough for the gate: it measures whether the judge reads a given answer correctly, and the judge
only ever sees text.

- **Natural answers:** 45, collected 2026-10-23 in two runs (the first ran out of OpenRouter credit after 5
  answers; `--resume` collected the rest). OpenRouter billed $1.264.
- **Bases:** 15 more answers to the fact prompts from the same three models, collected 2026-10-23 by the
  same script into the sealed directory (one call failed on an upstream rate limit and was collected by
  `--resume`). About $0.42.
- **Web search wasn't always used.** Requested for every call, but Gemini ran none on 9 of its 15 natural
  answers, and GPT and Claude skipped it once each (`usage.server_tool_use_details`). The judge only sees
  text, so this doesn't affect the gate, but v1 is not a clean test of grounded versus ungrounded answers.

**Known v1 limitation: the natural answers are public.** The 30 natural worksheet answers are byte-identical
to entries in the committed `answers.jsonl` (and their `text_sha256` values match), and the perturbed ones match
nothing. So diffing the worksheet against `answers.jsonl` or `raw.jsonl` would reveal which answers are perturbed.
This was accepted for v1 rather than regenerated:
- It can't be stumbled into. It takes a deliberate diff against named files, which only damages the measurement
  of whoever does it. That differs from information met incidentally, such as in a session transcript: "don't open
  two named files until the freeze" is a commitment someone can keep.
- Regenerating would cost another collection run, to close a hole only someone acting on purpose can use.
- The operator committed not to open `answers.jsonl`, `raw.jsonl`, `scope.json` or `docs/calibration-sealed/`
  until their 40 labels were frozen. The AI labeller was instructed not to open them either.

**The AI labels' supports/unclear skew.** The disclaimer rule in §4 was settled after v1 was labelled.
The AI labeller applied the opposite reading, treating an answer-level disclaimer as attached to every claim, so its
184 labels lean towards `unclear` where the operator would say `supports` (all 4 validation disagreements were this
case). The gate is unaffected: it turns on `contradicts`, which the rule order puts before `unclear`. Any measure
built on the `supports`/`unclear` split of v1 inherits the skew.

**The AI labeller's tells.** While labelling, the AI labeller noted 3 possible tells, sealed in `tells.md`
unread. They are opened after the freeze. If any describes something the AI labeller could act on, its labels are
suspect even at high agreement, because the agreement would then measure two labellers who both saw the same tell.
That is decided after reading them, not before.

## Notes for v2

- **Keep the natural answers sealed until the freeze,** like the bases: commit `answers.jsonl` and `raw.jsonl`
  with the frozen labels, not before. Hash them in `SEALS` meanwhile.
- **Format JSON before hashing it,** so biome's whitespace changes don't alter a sealed file's hash.
- Include long answers (comparison and "alternatives" prompts) so the 20,000-character cap and the shortening
  fallback are exercised.

**What v1 does not exercise.** v1's answers are 299–10,988 characters long (the longest are association
answers), all below the judge's 20,000-character answer cap. So this gate never triggers the cap, or the
fallback that shortens an answer when the judge reports it too long. Both stay in the job. They will
matter for comparison and "alternatives" prompts in a crowded category, which run far longer and carry
most of the signal. But this gate does not test them, and a later version needs long answers that do.
