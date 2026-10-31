# Procedure

The operational runbook for Brand Perception: how to prove the path, spend on it for the first time, and turn it on. `UPSTREAM.md` is the divergence ledger and the weekly catch-up procedure; this file is what to run, in order. Every command below reads `process.env` only. None of the scripts loads `.env`, so name the database you mean.

Run from the repo root with `TZ` unset. `<server>` is a Postgres server on this machine whose database names end in `_test` for rehearsals.

## 1. Rehearse

Proves the whole path on a throwaway database with the stub judge. It calls no one and spends nothing.

```
TYPESAFE_API_KEY=stub SCRAPE_TARGETS=stub:stub ONBOARDING_LLM_TARGET=stub:stub \
  TEST_DATABASE_URL=<server>/redemptia_test pnpm perception:dryrun
```

Must end with `Dry run passed: 24 checks, no call made, nothing spent.` Add `--stack` to see where a failing check failed and `--keep` to keep the database. It refuses a remote server unless `--allow-remote` is passed. CI runs it on every pull request (`Build`).

## 2. Preflight

Read-only against the database the worker will use. Every query runs in a read-only transaction. It checks the deployment mode, that the key is real and suits the mode, that association is off, that every migration is applied, and projects what the first real job would pick up and cost.

```
DATABASE_URL=<target> DEPLOYMENT_MODE=local TYPESAFE_API_KEY=<real key> pnpm perception:preflight
```

Every line must be `PASS`. It exits 1 on any `FAIL`. Do not continue past a failure.

## 3. First contact

One brand, a few prompts, a hard call budget, one pass, then it stops. It judges a handful of the brand's existing fact answers without turning the brand on.

Plan only (no calls, no writes):

```
DATABASE_URL=<target> DEPLOYMENT_MODE=local TYPESAFE_API_KEY=<real key> \
  pnpm perception:first-contact --brand <brandId>
```

The run (spends at most `--max-calls`, default 30, never more than 100):

```
... pnpm perception:first-contact --brand <brandId> --spend [--prompts 5] [--per-prompt 2] [--max-calls 30]
```

It writes `first-contact-<brand>-<time>.json` with every reply verbatim. These files are gitignored because they hold real answers; keep them off the repo.

## 4. Read the output

1. Read the summary it prints: answers, calls against the limit, questions, tokens, why it stopped, each answer's verdicts, and how many of the brand's recent answers the skip rule would skip.
2. Read the report file itself. Check each verdict against the reply beside it.
3. In TypeSafe's usage for the window the report names (`startedAt` to `finishedAt`), find what was charged, then price the run:

```
pnpm perception:first-contact --report first-contact-<brand>-<time>.json --billed-usd <amount>
```

It prints the price per call, per question and per million tokens, and what a day at perception's 2,000-call ceiling would cost at this run's averages. Per-token pricing is what the projections assume; this step is what confirms or corrects it.

## 5. Open the tap

Setting a real `TYPESAFE_API_KEY` is a separate, explicit decision, because the worker spends on its own once it has one (see `CLAUDE.md`, "Mention and sentiment judging"). On the first start with a real key:

- it re-requests judging for the last 30 days of unjudged runs;
- a database that `stub` judged is re-judged under the real stamp, which the preflight's projection counts;
- history is reprocessed back `REPROCESS_DAYS` (default 90) whenever the judge, the extractor or a brand's names or competitors change.

Bounds: 10,000 mention-judge answers per organization per UTC day (`DAILY_MENTION_JUDGE_CEILING`), 2,000 perception calls per organization per UTC day, and the provider-call ceiling (`DAILY_PROVIDER_CALL_CEILING`, or 1.5 times a normal day) on scraping.

1. Set `TYPESAFE_API_KEY=<real key>` in the worker's environment, with `SCRAPE_TARGETS` and the providers' keys. Restart the worker.
2. Turn a brand on with the switch on its Settings, Perception page. Nothing judges a brand that is off.
3. Watch the first hour: the worker log (`Registered the perception judge`), the Perception page, and the ceiling banners. Each ceiling raises one warning per organization per UTC day.

To close the tap, set the key back to `stub` or remove it: judging stops, and stub judgements are stamped as the stub's.

## 6. The catch-up gate

A weekly upstream catch-up (`UPSTREAM.md`, "Merging upstream") cannot land until the perception path has been proven to still work:

1. `pnpm perception:dryrun` from the merge commit prints `Dry run passed: 24 checks`. The count only grows; fewer than `main`'s is a failure.
2. `Build` runs the same step on every pull request, and `Build` is a required check in the `main protection` ruleset, so the catch-up PR cannot merge without it.
3. If a check fails, the catch-up broke the judge, the rollups, the history, the skip rule or a spend cap. Fix the merge, never the dry run.

Add a check to the dry run in the PR that adds the behaviour, and update the count here, in `CLAUDE.md`'s gate table and in `UPSTREAM.md` in the same PR.
