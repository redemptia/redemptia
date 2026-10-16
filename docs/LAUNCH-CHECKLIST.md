# Launch checklist

Where Redemptia stands at the end of Phase 8 (14 October 2026): what has to happen before launch, what has been measured, what is only modelled, and which gaps ship knowingly. Each figure says where it came from.

## Blockers before real customer data

These stop Redemptia taking a real customer's data, whatever else is ready.

1. **A paid Gemini key for the sentiment analyzer.** The analyzer runs on a free-tier key today. Google's free-tier terms may let it use what is sent to improve its products, and what is sent is customers' AI answers and their brand and competitor names. Use a paid key, under terms that exclude training on inputs, before any customer's answers are judged. Set it as `SENTIMENT_API_KEY`; the model choice is in CLAUDE.md.
2. **Redemptia's own terms of service and privacy policy, before cloud signup.** elmo's legal pages were removed in #61 because they name elmo's company, and the signup and checkout screens no longer show a consent line. Cloud signup should stay closed until Redemptia's own terms and privacy policy exist, are linked from those screens and are reviewed.
3. **npm scope and registry credentials for the CLI and Docker publish.** The CLI is renamed `@redemptia/cli` and the images `redemptia/redemptia-*` in code only. Publishing needs the npm scope and a container registry account, with their tokens set as the secrets `publish.yaml` reads. Until then the publish workflow fails, and the README's install path is "from source".

## Before public launch

- **Turn on private vulnerability reporting** (repository Settings → Code security). SECURITY.md and the support page send reporters there, and it is off (`{"enabled":false}` on 14 October 2026).
- **Point DNS for `redemptia.in`** (domain bought 15 October 2026) at the deployments. Every link now uses it: the marketing site on `redemptia.in`, the cloud app on `app.redemptia.in`, the demo on `demo.redemptia.in`, all set in `packages/config/src/referrals.ts`; docs links use `redemptia.in/docs`.
- **A private contact address for Code of Conduct reports.** They go to the maintainer's GitHub handle today.
- **Re-capture the product screenshots** in `apps/www/public/screenshots/`. All 9 still show elmo's logo and `demo@elmohq.com`.
- **Replace the homepage walkthrough video.** The Mux playback ID in `apps/www/src/components/home/hero.tsx` plays elmo's recording of its own UI.
- **Set production `SCRAPE_TARGETS`** to `openai-api,searchapi`, as decided in CLAUDE.md, with those providers' keys.
- **Optional, and off unless set:** your own PostHog key (`VITE_POSTHOG_KEY`, `POSTHOG_KEY`) and Crisp inbox (`VITE_CRISP_WEBSITE_ID`). With none set, nothing is sent anywhere.

## Measured

| What | Result | Source |
|---|---|---|
| Sentiment agreement with the golden set, overall | **90.3%** (121/134), target ≥ 85% | Phase 2 eval, #48 |
| … `disrecommended` | **100%** (20/20), target ≥ 90% | #48 |
| … `recommended` / `mentioned_neutral` / `comparison_anchor` | 100% (34/34) / 86.5% (32/37) / 95.0% (19/20) | #48 |
| … `mentioned_caveated` | 69.6% (16/23), the weakest class | #48 |
| Tokens and cost per call, golden set | 281 input, 145 output; $0.000446 at Google's list price | #48 |
| Local smoke test, 40 seeded runs (20 distinct answers, each replicated twice) | 20 paid calls, 49 judgements: recommended 18, neutral 15, caveated 7, disrecommended 4, comparison anchor 5. 40 of 49 carry a verbatim evidence quote. | Manual run, 13 October 2026 |
| Tokens and cost per call, smoke test | 284 input, 175 output. Recorded as $0.021 in total, $0.00104 per call. | Same run |
| Mention analysis storage | 248 MB per Business brand per 90 days (sparse rows). `run_texts` 1.0–2.7 GB per brand per 90 days at 2–8 KB answers. | Synthetic seed, #29 |

**Caveats on these numbers:**
- **Agreement isn't independent.** The golden-set labels are Claude's draft, revised once by Claude and approved by the maintainer. Five of the nine corrections moved a label to what an earlier model run had predicted.
- **The smoke-test cost isn't a bill.** `usage_events` prices calls at **twice** Google's list price ($0.60 / $5 per million tokens), so the spend ceiling errs strict. At list price the smoke test's calls cost about **$0.00052** each, roughly 17% above the golden set's, because they produced more output tokens. On the free tier they were billed nothing.
- **The smoke test was slow.** The free tier rate-limits: 20 calls took about 20 minutes.

## Modelled, not measured

- **Enrichment cost per Basic customer.** Assumptions: 50 prompts × 4 platforms × 4 runs a day × 30 days = 24,000 runs a month; every run mentions a subject; no answers repeat.

  | Price per call | Monthly cost | Share of $99 | Source |
  |---|---|---|---|
  | $0.000446 | $10.70 | 10.8% | Phase 2 model, golden set |
  | $0.00052 | **~$12.55** | **~12.7%** | Smoke test, at list price |
  | $0.00104 | ~$25 | ~25% | Smoke test, at the ceiling's 2× rate |

  The target is ≤ 15% of plan price.

  **This needs re-checking on real runs.** The smoke test's seeded answers averaged about 182 characters, shorter than real engine answers, and longer answers mean more tokens per call. Deduplication of identical answers and the real mention rate both lower the figure; longer answers raise it.
- **Storage growth beyond 90 days.** #29 measured one 90-day window, and longer horizons are extrapolated from it.

## Knowingly shipped gaps

Each has an open issue or a line in `docs/HANDOFF-PHASE-2.md` §5.

| Gap | Where | Why it can wait |
|---|---|---|
| `run_texts` and `prompt_runs.raw_output` have no retention; only mention analysis does | #29 | Largest tables. Retention for derived rows shipped in #59 (off by default). |
| Sentiment sweep queues no-op batches for orgs without sentiment | #55 | No spend; queue churn only |
| `backfill-sentiment --dry-run` over-estimates | #56 | Errs high, the safe direction |
| No e2e test for the "not in your plan" notice | #57 | REST and MCP refusals are integration-tested |
| `mcp.mdx` omits `get_mention_prominence` | #58 | Docs only |
| Backfill text extraction diverges for three provider paths | #18 | Doesn't apply to the decided `SCRAPE_TARGETS` |
| Dashboard rename mints a new competitor id | #24 | Analysis is keyed by name, so history re-matches |
| Share-of-voice and response-search performance | #26, #15, #16 | Performance, not correctness |
| Verified-brand-id type; org-level billing guard | #20, #22 | Structural hardening |
| Flaky e2e (`overview.spec.ts`, `api-keys.spec.ts`) | #43 | Re-run once; fix if it recurs |
| Plan gating shown only in cloud mode | — | Local mode is unlimited; exercising the Starter path locally needs Stripe, Resend and Google sign-in settings |
| The worker's self-healing scheduler re-runs seeded prompts | — | Expected behaviour; only matters for hand-seeded test data |
| Three elmo names are kept: `ELMO_ENCRYPTION_KEY`, `x-elmo-*`, `QUOTA_LOCK_CLASS` | CLAUDE.md | Renaming them breaks live deployments or the quota lock |

## Not done in this phase

- Phases 4–7 (keyword plumbing, demand, the priority worklist, calibration) have not started. Phase 4 is gated on a coverage query against production data.
