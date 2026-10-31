# Perception calibration corpus: labelling procedure

This corpus is the accuracy gate for Brand Perception. No perception figure is shown to a user until
the judge clears it. It measures how often the judge's answers to **our** closed-set questions match
labels that a human wrote **before any model saw the item**. It does not measure elmo's mention or
sentiment judge.

Each corpus version lives in its own directory (`v1/`, `v2/`, …) and is frozen once labelled. Change
this procedure only by starting a new version.

## 1. What is labelled

| Half       | Unit                                                 | Options                                                  |
| ---------- | ---------------------------------------------------- | -------------------------------------------------------- |
| Facts      | one fact × one whole answer                          | `supports` · `contradicts` · `not_mentioned` · `unclear` |
| Attributes | one attribute × one whole answer, brand subject only | `positive` · `negative` · `mixed` · `not_discussed`      |
| Drift      | one whole answer, brand subject only                 | `yes` · `no`                                             |

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

Every rule below is about **this attribute only**: a judgement of another attribute never moves this
label. (Labelling version 2, approved 2026-10-26. Version 1, the first labels, read `mixed` as "both,
or a conditional", which two model families read differently; the cross-model results in §7b under
version 1 are kept as they were.)

- **`positive`**: every judgement the answer makes of the brand on this attribute is favourable. A
  neutral fact beside it ("the free tier includes 500 MB") or a hedge ("generally", "usually") doesn't
  make it mixed. Judgements that are all favourable but differ in strength are `positive`.
- **`negative`**: every judgement on this attribute is unfavourable, including a limitation stated as a
  drawback ("pauses after a week of inactivity", "gets expensive at scale"). It stays `negative` however
  much the answer praises other attributes.
- **`mixed`**: the answer makes at least one favourable **and** at least one unfavourable judgement on
  this same attribute ("cheap to start, expensive at scale"), or makes its judgement conditional on the
  buyer ("a good choice only if you're comfortable with SQL"). Criticism here beside praise of a
  different attribute is `negative`, not `mixed`; praise here beside criticism of a different attribute
  is `positive`, not `mixed`.
- **`not_discussed`**: no favourable or unfavourable judgement on this attribute: a bare mention, or a
  feature named in a neutral list or a factual sentence. An item in a list the answer frames as
  strengths or pros, or as weaknesses or cons, is a judgement in that direction.
- **Two-quality questions** (the frozen list has some, §4.1 of the spec): if the answer judges one
  quality and is silent on the other, label by the one it judges; if it judges the two in opposite
  directions, `mixed`.
- **Drift`yes`**: the answer makes a favourable or unfavourable judgement of the brand on a quality no
  frozen attribute covers, alone or together. A neutrally named feature or a summary phrase ("in one
  integrated platform") is `no`. Mark the span. Otherwise `no`.

The subject rule from §4 applies.

## 5a. What labellers ignore

- **Tracking parameters in links.** `utm_source=openai` and similar parameters are added by the answering
  engine. They say nothing about the brand and are never evidence for any label.

## 6. Item origin

| `origin`    | What it is                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `natural`   | A real answer, unmodified.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
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

## 6b. Corpus rate is not product rate

The gate asks whether the judge **recognises** a contradiction when shown one, and that accuracy
transfers however often contradictions occur in the wild. So a corpus may deliberately over-sample
the answers where contradictions live, such as ungrounded answers about recently changed facts, to
harvest enough natural contradictions to measure. That is not a bias in the gate. The corpus's
contradiction rate, though, is **never** presented as an expected product rate: no write-up may
quote it as how often AI gets a brand wrong.

## 7. The gate

For `contradicts`, computed on the gold labels (§2a says whose):

- precision ≥ 0.85, **and** the lower bound of its 95% Wilson interval ≥ 0.75;
- recall ≥ 0.70, **and** the lower bound of its 95% Wilson interval ≥ 0.60.

Both bounds were fixed on 23 October 2026, before the v1 run. The asymmetry is deliberate: a false
contradiction accuses the customer's facts of being wrong and costs their trust in the product, while a
missed contradiction costs them one finding. So precision carries the stricter bar.

Report both, for both the natural and the enriched set. If the interval is too wide to pass, add
contradiction items. Never lower the bar.

### 7a. The attribute bar

Fixed on 24 October 2026, before any attribute item was labelled. Computed on the gold labels of the
attribute half (§7b), for the brand subject only.

**Which items each bar is measured on (decided 2026-10-24, before any operator label or judge run).**
The headline is the 150 attribute items and 15 drift items from the 15 association answers: they are
the only items shaped like what the association path judges in production. The discussed bars and the
drift bar are measured on them alone. The negative bars are measured on the natural association items too: with
part 2 (§7b) they hold 61 natural negatives by the AI labels, so no planted negative is needed (decided
2026-10-26). Both sets of perturbed copies are reported apart and gate nothing, and negative recall
rests on natural negatives alone. The 300 items from the fact-prompt answers come
from a prompt class the association path never sees, and contributed 275 of the 345 `not_discussed`
labels, so measuring the discussed boundary mostly on them would measure the wrong thing. They are
reported apart, like the perturbed copies, and gate nothing. A shortfall on the headline stops the gate
whatever the other sets show.

| Measure                                                                                                      | Bar                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discussed vs not discussed**, scored as two classes (`positive`, `negative` and `mixed` are all discussed) | accuracy ≥ 0.90, and the lower bound of its 95% Wilson interval ≥ 0.84; discussed precision ≥ 0.85 and discussed recall ≥ 0.85                                                              |
| **`negative` precision**                                                                                     | ≥ 0.85, and its Wilson lower bound ≥ 0.70                                                                                                                                                   |
| **`negative` recall**                                                                                        | ≥ 0.70, and its Wilson lower bound ≥ 0.50                                                                                                                                                   |
| **Drift`yes` precision**                                                                                     | ≥ 0.80 on the corpus, with every false `yes` listed; then at Checkpoint 7, at least 16 of 20 drift passages from the live review queue, read by eye, describe a quality no attribute covers |

Why these and not the fact bar:
- **Discussed vs not discussed** is the boundary every association score and every coverage figure rests
  on: a false "discussed" inflates coverage, a false "not discussed" shrinks n. So it gets its own
  accuracy, and precision and recall so neither error hides inside the other.
- **`negative`** is the class a customer acts on, so it carries the precision bar, as `contradicts` does.
  A gold `mixed` that the judge calls `negative` counts as a false `negative`. Recall is looser for the
  same reason as the fact bar's: a missed negative costs one finding, a false one costs trust.
- **Drift** has 15 items, too few for a meaningful lower bound (4 of 5 correct has a lower bound of
  0.38), so the corpus bar is a point estimate with every false `yes` shown, and Checkpoint 7's reading
  of real queue passages is the second check.
- `positive` and `mixed` have no bar; they are reported in the full confusion matrix.

Rules:
- **Natural and perturbed items are reported separately.** Every bar is decided on natural association
  items; perturbed copies are reported for comparison only.
- **The negative class is counted before the judge runs.** Once the AI labeller has labelled every item,
  the natural gold `negative`s are counted. Fewer than 30 is reported then, and the operator chooses
  between perturbed copies (one characterisation in a copy of an answer flipped to negative) and
  labelling the fact-prompt answers' attribute items. The judge runs only after that choice.
- **An interval too wide to pass is fixed with more items,** never a lower bar.
- **Every figure carries the attribution line** of §2a, with the attribute half's own sample size,
  agreement and κ.

### 7b. Labelling the attribute half (v1)

The items are the 15 natural association answers (P11–P15, three models each): one item per answer
and frozen attribute (150), and one drift item per answer (15). The association answers held 12
natural negatives by the AI labeller's count, below §7a's 30, so the 30 natural fact-prompt answers
were added: one item per answer and frozen attribute (300 more), and no drift items, since drift is
asked of association answers only. That makes 450 attribute items. Labels follow §5, against each
attribute's `question_text`. The method is §2a's, with these changes:
- the validation sample is **15 hard attribute items** from the 150 association items (the headline
  set; the fact-prompt items gate nothing), drawn by the AI labeller from its own labels: 10 it labelled `negative`, spread across answers and attributes, and
  5 genuine discussed vs not discussed boundary cases (at least 2 it called `not_discussed` despite a
  mention of the topic, at least 2 it called discussed on thin evidence). Obvious `not_discussed`
  items are left out: they are most of the population and only inflate raw agreement;
- the operator also labels all 15 drift items blind, and **those are drift's gold labels**: the human
  labels every drift item, so the AI's drift labels aren't used for the gate. Agreement between the two
  is still reported.

**Why 15 hard items, decided 2026-10-24, before any operator label.** The first design, 40 items
stratified by label with at least 10 negatives, spent most of the operator's time on items no one
disagrees about. A hard sample spends it where the gate's figures can go wrong: the `negative` class
the bar rests on, and the discussed boundary that every coverage figure rests on. A pass on hard items
is stronger evidence than the same rate on a random sample. It doesn't validate the easy
`not_discussed` items directly; their main risk, a bare mention called discussed, is what the boundary
items test.

**The decision rule at 15 items.** κ stops being a decision criterion. On a hard, negative-heavy
sample, chance agreement is not the population's, and at 15 items κ's 95% interval is about ±0.25:
14 of 15 in agreement gives κ ≈ 0.87 with an interval of roughly 0.63–1.0, and 13 of 15 gives κ ≈ 0.74
with roughly 0.41–1.0. A κ ≥ 0.8 threshold would pass or fail on a single item, so it would carry no
information that the count doesn't. The rule is:
- the AI attribute labels count as gold when the operator agrees with them on **at least 14 of the 15**
  hard items (the ≥ 90% rule's only passing results at 15 items are 14 and 15), **and** on `negative`
  they disagree on at most one item (of the items either labelled `negative`, both did on all but one);
- κ, its interval and the confusion matrix are reported beside the decision, never in place of it;
- otherwise the AI labels are discarded and the operator labels every natural attribute item.

**Part 2: answers to the shipped templates (added 2026-10-26, before the operator labelled anything).**
P11–P15 are not the association prompts the product ships, so 36 answers to the six shipped
`ASSOCIATION_PROMPT_TEMPLATES` were collected (Supabase, the same three models, two runs per prompt;
$0.98). They were shuffled together with 20 association-based perturbed copies (copies of the P11–P15
answers, one negative planted in each) into `worksheet-2.md`, every answer with 10 attribute items and
a drift item, so copies can't be told from natural answers by their items. A fresh AI labeller, which
had seen none of the earlier answers, labelled all of part 2 blind. The P11–P15 answers stay in the
corpus as their own set. The operator's part-2 sample is 15 hard attribute items from the 36 natural
answers (10 negative, 5 discussed-boundary) and the drift item of each of those 36 answers, so the
operator labels every natural association answer's drift item. The two parts' samples are pooled for
the decision rule: at least 90% of the hard items in agreement, and at most one disagreement on
`negative` per 15 hard items (27 of 30 and 2 at 30 items).

**A validation sample must be stratified (recorded 2026-10-26, after an invalid run).** An agreement
bar means something only on a sample shaped like the corpus: drawn at random within each of the
labeller's labels, in corpus proportion. The 30 hard items (10 negatives and 5 boundary cases from each
part) were checked against the ≥ 90% bar first, which measured the draw rather than the labels: one
labeller had called 20 of them negative and none mixed, by construction. So:
- the gating sample is **40 of the 510 natural association attribute items, stratified by the AI labels
  in corpus proportion** (`validation-stratified.json`, seed 20261028: 12 positive, 5 negative, 7 mixed,
  16 not_discussed);
- the 30 hard items are a **diagnostic set**: reported beside the gate, gating nothing. A low hard-item
  agreement under a passing stratified one is a known weakness to state on the figure, not a failure.

Cross-model results under §5 as first written (Claude labels against `google/gemini-3.8-flash`, both
blind; sealed before comparison):

| Set                  | Agreement                 | κ                | Negative disagreements | Discussed vs not | Negative and mixed as one |
| -------------------- | ------------------------- | ---------------- | ---------------------- | ---------------- | ------------------------- |
| Stratified 40 (gate) | 34 of 40 (85%), 36 needed | 0.79 (0.63–0.94) | 2 (2 allowed)          | 92.5%, κ 0.85    | 87.5%, κ 0.81             |
| Hard 30 (diagnostic) | 14 of 30 (47%)            | 0.26 (0.01–0.50) | 12                     | 77%, κ 0.32      | 77%, κ 0.55               |

The stratified sample fails §7b by two items. Four of its six disagreements involve `mixed`.

Cross-model results under §5 version 2 (both families relabelled from scratch; sealed before comparison):

| Set                  | Agreement                 | κ                | Negative disagreements | Discussed vs not          | Negative and mixed as one |
| -------------------- | ------------------------- | ---------------- | ---------------------- | ------------------------- | ------------------------- |
| Stratified 40 (gate) | 32 of 40 (80%), 36 needed | 0.72 (0.55–0.89) | 3 (2 allowed)          | 90.0%, κ 0.79 (0.60–0.99) | 85%, κ 0.77               |
| Hard 30 (diagnostic) | 22 of 30 (73%)            | 0.52 (0.24–0.80) | 4                      | 86.7%, κ 0.52             | 83%, κ 0.65               |

**Result: the gate fails, and so does the fallback fixed in SPEC §12 beforehand** (it needed discussed vs
not discussed at ≥ 90% with κ ≥ 0.8; κ is 0.79). Version 2 improved the hard items (negative agreement
0.60 → 0.89) but not the stratified sample (34 → 32 of 40). Drift, version 2: the AI says yes on 12 of
the operator's 15 drift items, the operator on 7; they agree on 10.

**Conclusion (2026-10-26): attribute figures are not validated and don't ship in v1.** Two frontier
model families reach κ 0.72–0.79 on representative items; version 2 of the rules improved the hard set
and lowered the stratified one; the disagreements now spread across every boundary. That is a
construct with a low reliability ceiling, not an underpowered sample: a larger draw would measure 0.79
precisely, not raise it, so no further draw is made. The association path stays built and judges on
the stub; its verdicts accumulate, undisplayed, against a gate that may be revisited with a different
question shape.

**Drift's human labels (2026-10-26).** The operator's human attribute sample was dropped for
cross-model validation; one human step stays: 15 drift items drawn at random from the shipped-template
answers (`validation-drift.json`), labelled yes or no alone. These are drift's gold. The operator first
said yes on 4 of 15, then, after a consistency check showed three no's on qualities they had called yes
elsewhere (Edge Functions' limits in D39 against D34; offline-first mobile sync in D54 and D64 against
D66), revised D39, D54 and D64 to yes: **7 of 15**. The AI labeller said yes on 15 of 15. The drift
question's wording stands; the gap is the finding: the AI counted neutrally named features and summary
phrases, which the version 2 drift rule (§5) now excludes.

**Decision (2026-10-29): the §12 fallback was reconsidered and no further draw is made.** A 150-item
binary draw (discussed vs not discussed only, from the 470 natural association items outside the
40-item sample, 89 discussed and 61 not discussed, for a κ interval of about ±0.10) was specced and
declined, on two grounds:
- **A larger sample doesn't move the verdict.** The fallback came in at 90% agreement with κ 0.79
  against κ ≥ 0.8. Simulated at 90% true agreement and the corpus's 59% discussed prevalence, the
  observed κ clears 0.8 in 46% of draws at n = 40, 45% at n = 150 and 44% at n = 300: the median stays
  at 0.80 and only the interval narrows. A pass would measure the number, not raise it.
- **The corpus can't license coverage per attribute.** Outside the 40-item sample, `dx` has 4 not
  discussed items, `sql_power` 5 and `self_host` 6, so a boundary that cleared overall would still
  validate nothing per attribute, and coverage per attribute is the figure the fallback would ship.

This confirms the conclusion above. Nothing is pending.

**Attribution for the attribute half.** Every figure states: "attribute labels AI-generated, validated
against 15 blind human labels on hard items (10 negative, 5 discussed-boundary) at X of 15 in agreement
(κ Y); drift labels are the human's own, on all 15 drift items; the human labeller had previously seen
quotes from the 15 association answers in the Checkpoint 6 reports." That exposure is a real limit on the blindness of those labels, so it travels with the
figure. The files live in `v1/attributes/`, sealed ones in
`docs/calibration-sealed/attributes/` until the freeze, with hashes in `v1/SEALS` as before.

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

## 10. Turning perception on for a real brand

Two commands, run from the repo root. Neither loads `.env`; each is told its database explicitly.

**Rehearse (throwaway database, stub judge, spends nothing):**

```
TEST_DATABASE_URL=postgres://localhost:5432/redemptia_test pnpm perception:dryrun
```

It creates and drops its own `redemptia_dryrun_*_test` database on a local server, migrates it, seeds a
brand with facts, fact prompts and a day of answers, runs the job, and checks the verdicts, stamps,
call count (one per answer), budget counter, rollup markers, readout, re-judge count under a real key,
the ceiling, and that the preflight changes nothing. Run it after any change to the job, the stamp or
the migrations.

**Preflight (read-only, safe against a live database):**

```
DATABASE_URL=<target> DEPLOYMENT_MODE=<mode> TYPESAFE_API_KEY=<key> pnpm perception:preflight
```

It checks the mode (`local` or `whitelabel`), that a real key is not set under `demo` or `cloud`, that
the key is set and not `stub`, that `ASSOCIATION_ENABLED` is false, and that every migration in the
journal is applied. It then prints what the first real job would pick up (`first-job-count.sql`) and
the projected cost, and stops. Every query runs in a read-only transaction. Exit 1 means do not proceed.

What still needs a person, in order, after the preflight is clean:

1. Decide the printed cost is acceptable. The Jev figure assumes per-token pricing (CONSIDERATIONS §9);
   Elmo's judge also re-requests the last 30 days at every worker start, uncapped (#85).
2. Run the migrations on the target. Never `drizzle-kit push`.
3. Set `TYPESAFE_API_KEY` where the worker reads it, and restart the worker.
4. Switch the one brand on (`perception_brand_settings.enabled`), and read the readout and the settings
   page's daily check budget line.

To stop: switch the brand off (the job judges nothing for it), or set the key back to `stub`.

## Notes for v2

- **Make most perturbations buried, not standalone.** v1's gate missed 2 of 36 planted contradictions, and
  both were the same shape: one contradicting sentence inside an answer that otherwise supports the fact
  (F10, self-hosting). That is the more realistic shape, since stale information appears embedded in an
  answer, not on its own. Most v2 perturbations should be buried this way. **Expect recall to fall** when
  they are: v1's 0.944 was measured mostly on standalone insertions.
- **v2 is also the calibration set for confidence.** The two v1 misses had confidence 0.55 and 0.17, against a
  median of 1.00 for correct verdicts. Confidence may catch exactly this failure mode, but it stays unused
  until v2 shows how far it can be trusted.

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
