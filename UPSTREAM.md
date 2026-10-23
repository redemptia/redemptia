# Upstream

Redemptia is an independent product built from the [elmohq/elmo](https://github.com/elmohq/elmo) codebase (MIT).
elmo is tracked as a read-only `upstream` remote, and this file records every intentional divergence from it.

## Origin

Redemptia started as a **clone** of elmohq/elmo, not a GitHub fork: the repository was cloned at elmo commit
[`39d4700d`](https://github.com/elmohq/elmo/commit/39d4700d87b3e8785894907a6d1e9b3d94b4271a) (2 October 2026,
"switch DataForSEO links to the affiliate program", #850), its `origin` remote was repointed to
`github.com/redemptia/redemptia`, and elmo was added back as `upstream` with pushing disabled. GitHub holds no fork
relationship between the two repositories; changes move one way, from `upstream`, by merging it (see
[Merging upstream](#merging-upstream)).

**Last caught up to:** elmo
[`80753f80`](https://github.com/elmohq/elmo/commit/80753f80666ec53b00d2d15f92cdd45b3530ac14), 5 commits after `20954aa2` (#79), in #99. Both
landed as merge commits, so `80753f80` is an ancestor of `main` and each merge reverts with `git revert -m 1`. The
next catch-up's merge base is `80753f80`.

The code is MIT on both sides. `LICENSE.md` keeps elmo's copyright notice next to Redemptia's, as the license
requires, and `CITATION.cff` credits elmo as the work Redemptia derives from.

What differs from elmo, in brief (the table below has every change and why):

- **Measurement.** None: mentions, sentiment, rollups and replayable extraction are elmo's, judged by Jev. Our own
  sentiment feature (answer-text storage, prominence and rank, a Gemini stance judge, its spend ceiling and
  retention) was removed in #77 in favour of elmo's.
- **Brand Perception.** Additive: our own tables and code, plus a short list of elmo files edited in place (see
  [Brand Perception](#brand-perception)). Perception prompts are left out of every headline metric.
- **Reliability.** Prompt jobs share one expiry and don't retry from the web app (#6, #8); the database pool size is
  explicit (#11).
- **Data integrity.** Cross-tenant list reads must name their scope (#23). Competitor names are *not* unique per
  brand, as in elmo ([#78](https://github.com/redemptia/redemptia/issues/78)).
- **Identity.** The product is renamed Redemptia; five names keep elmo's spelling or a fixed value so deployments and
  locks are unaffected (listed in `CLAUDE.md`). Nothing is sent to elmo's services: telemetry, support chat and
  newsletter signups run only with the operator's own keys, affiliate codes and elmo's ad tags are gone, and the
  SDKs carry Redemptia's names but aren't published.
- **Site and content.** The marketing site (`apps/www`) is ours wholesale. elmo's blog posts and legal pages are
  deleted, as is its contribution licence agreement.
- **CI.** GitHub-hosted `ubuntu-24.04` runners instead of elmo's Blacksmith runners, except where noted.

## Divergences

| Change | Upstream files touched | Why we diverge |
|---|---|---|
| Prompt jobs enqueued from the web app don't retry (`retryLimit: 0`). | `apps/web/src/lib/job-scheduler.ts`, `apps/web/src/lib/boss-client.ts`, `apps/worker/src/index.ts` (#6) | By the time a prompt job can fail it has submitted paid provider requests, and a queue-level retry re-submits the whole fan-out, including the runs that succeeded. elmo's web side still sends `retryLimit: 3`. |
| One set of prompt-job options, `PROMPT_JOB_OPTIONS` in `packages/lib/src/constants.ts` (`retryLimit: 0`, `expireInSeconds: 90 * 60`), is used by the web scheduler, the queue policy (`createQueue` plus `updateQueue` in both web and worker) and the worker's own sends. | `packages/lib/src/constants.ts`, `apps/web/src/lib/job-scheduler.ts`, `apps/web/src/lib/boss-client.ts`, `apps/worker/src/index.ts`, `apps/worker/src/jobs/process-prompt.ts`, `apps/worker/src/jobs/schedule-maintenance.ts` (#8) | elmo defines the same values in `process-prompt.ts` for the worker only; its web side and its queue policy still expire jobs after 15 minutes, which marks a run failed while a slow provider is still answering. **When merging:** if elmo edits its `PROMPT_JOB_OPTIONS` in `process-prompt.ts`, carry the change to `lib/constants` and keep the worker importing from there. |
| The database pool size is set explicitly, from the optional `DATABASE_POOL_MAX` (default `10`, node-postgres's own default, so leaving it unset changes nothing). | `packages/lib/src/db/db.ts` (`createDb` passes `max: getDatabasePoolMax()`), `packages/config/src/env-registry.ts`, `turbo.json`, `apps/web/src/env.d.ts`, `packages/docs/content/docs/developer-guide/configuration.mdx` (#11) | elmo leaves the pool at the driver default with no way to change it. The worker alone can run more handlers than 10 connections, so the size needs to be visible and tunable. It's per process: anyone raising it has to multiply by the process count against Postgres's `max_connections` (the arithmetic is in the comment in `db.ts`). |
| `scope` is a required key (type `SQL \| undefined`) on `ListPromptsFilters`, `ListCompetitorsFilters` and `ListBrandsFilters`. elmo has it as optional `scope?: SQL`. The runtime query is unchanged. | `apps/web/src/server/prompts-core.ts`, `apps/web/src/server/competitors-core.ts`, `apps/web/src/server/onboarding-core.ts` (#23) | These are the only core reads that can return more than one tenant's rows, and leaving `scope` out returns all of them. With RLS inert, the condition is the only tenancy guarantee, so forgetting it must fail to compile. |
| CI runs on GitHub-hosted `ubuntu-24.04`. `publish.yaml` and `test-providers.yaml` still name Blacksmith runners (and `publish.yaml` its `useblacksmith/*` build actions), so neither can run here as written ([#83](https://github.com/redemptia/redemptia/issues/83)). | `.github/workflows/build.yaml`, `e2e.yaml`, `license-check.yaml`, `mode-compat.yaml`, `skill-install.yaml` (`ed91bb17`, #79) | Blacksmith runners belong to elmo's account. |
| `build.yaml` checks that `schema.ts` matches the migrations (`drizzle-kit generate` writes nothing) and that a database upgraded from the base commit's migrations applies every journal entry, loses no index its own SQL doesn't drop, and ends with exactly the latest snapshot's indexes plus `RAW_INDEXES` (`packages/lib/scripts/check-migrations.mjs`, `packages/lib/scripts/index-census.mjs`). | `.github/workflows/build.yaml` (#10, kept through #77; index checks added after #86) | drizzle's drift check compares `schema.ts` with the snapshots, never with a database. The upgrade check is the only thing that catches a migration drizzle skips without a word, an index a dropped column takes with it (0024 lost two), or an index left under an old name (0008). See [Migrations](#migrations). |
| Migration `0031_prompt_runs_brand_created_at_idx`: `prompt_runs_brand_id_created_at_idx` on `(brand_id, created_at)`, declared in `schema.ts`, and `prompt_runs_web_search_model_group_created_at_idx` renamed to the `prompt_runs_web_search_model_created_at_idx` that `schema.ts` and every snapshot since 0008 already use. | `packages/lib/src/db/schema.ts`, `packages/lib/src/db/migrations/` | 0024 dropped elmo's two analytics indexes with their `INCLUDE` columns (#86). Neither comes back: analytics reads the rollup tables now, and the rollup rebuild reaches runs through `(prompt_id, created_at)`. The Responses page still reads a brand's runs newest first. At 1.1M runs that is fast without a brand index, but at 4.4M the plan flips to a backward `created_at` scan that discards other tenants' runs: page 1 took 67.7 ms, and 0.33 ms with this index. The index costs about 6% of the table (36 MB at 4.4M runs) and one more btree write per run. 0008 renamed the column but never the index, so the migrated name and the declared name disagreed until now. **When merging:** if elmo's own 0031 renames or drops either index, keep one statement per index. |
| The CLA and the upstream marketing automation are removed: `CLA.md`, `.github/contributors.txt`, `.github/workflows/cla-check.yaml` and `.github/workflows/daily-blog-draft.yaml` are deleted, and CONTRIBUTING.md keeps only the MIT license terms. | `CLA.md`, `.github/contributors.txt`, `.github/workflows/cla-check.yaml`, `.github/workflows/daily-blog-draft.yaml`, `CONTRIBUTING.md` (#44, #63) | The CLA grants rights to upstream's company and its check fails every PR here. The blog workflow drafts posts for upstream's marketing site. **When merging:** drop any upstream change to these files. |
| The product is renamed Redemptia, and nothing points at or reports to elmo: telemetry (PostHog), support chat (Crisp) and the CLI newsletter run only with the operator's own keys (`VITE_POSTHOG_KEY`, `POSTHOG_KEY`, `VITE_CRISP_WEBSITE_ID`); affiliate and referral codes are dropped; marketing, cloud and demo URLs are on `redemptia.in`, set in `packages/config/src/referrals.ts`. API keys are minted as `redemptia_…`, whitelabel claims are `redemptia_*`, and two advisory-lock keys are `'redemptia-user-memberships'` and `'redemptia-rollups'`. | Most of the repository: product copy, `packages/docs`, package names (`@redemptia/cli`), icons and assets, `packages/config/src/referrals.ts`, the PostHog and Crisp loaders, `apps/web/src/server/api-keys.ts`, `packages/deployment/src/auth-hooks/whitelabel.ts`, `packages/lib/src/db/auth-sync.ts`, `packages/lib/src/rollups/rebuild.ts` (#61, #67, #79) | elmo's identity, keys and claims belong to elmo. `ELMO_ENCRYPTION_KEY` (and `_OLD`), the `x-elmo-*` OpenAPI extensions and `QUOTA_LOCK_CLASS` keep their names, because renaming them breaks live deployments or the quota lock. The two renamed lock keys are now fixed names in their own right (see `CLAUDE.md`). |
| elmo's Google Ads and Meta Pixel tags are left out: `packages/ui/src/lib/ad-tags.ts` is deleted, with its calls in `apps/web/src/routes/__root.tsx` and `apps/web/src/routes/_authed/choose-plan.tsx` and its `AD_TAG_CSP` entries in `apps/web/src/server.ts`. elmo's `idle.ts`, `onMarketingConsent` and the `stripeSubscriptionId` field on billing state stay. | `packages/ui/src/lib/ad-tags.ts`, `apps/web/src/routes/__root.tsx`, `apps/web/src/routes/_authed/choose-plan.tsx`, `apps/web/src/server.ts` (#79) | The tags report to elmo's own ad accounts (`AW-18500607241`, pixel `2332896134120550`), and with elmo's legal pages deleted we have no privacy policy or cookie disclosure covering ad tags. **Unblock:** our own account IDs *and* a published legal page come first. The cookie banner's unused Advertising category is [#80](https://github.com/redemptia/redemptia/issues/80). |
| The SDKs are named `@redemptia/sdk` (npm) and `redemptia-sdk` (PyPI), with the `redemptia_` key prefix that `apps/web/src/server/api-keys.ts` mints, and neither is published. The Settings → API SDK section is off behind `SDKS_PUBLISHED = false`, `generate.yml` runs only by manual dispatch, and `sdks.mdx` warns that the packages aren't published. | `hey-api.config.json`, `.hey-api/readme/auth.md`, `.github/workflows/generate.yml`, `apps/web/src/routes/_authed/app/org/$org/settings/api.tsx`, `apps/web/src/stories/api-settings.stories.tsx`, `packages/docs/content/docs/api/sdks.mdx` (#79) | elmo publishes `@elmohq/sdk` and `elmo-sdk` through Hey API's hosted pipeline, which needs a GitHub App and `HEY_API_*` secrets we don't have; on a push, a schedule or after Release, `generate.yml` would fail at its GitHub App check. An install line for an unpublished name points users at whoever registers it first. **Unblock:** publish both packages, then flip `SDKS_PUBLISHED`, restore the stories' SDK assertions, drop the `sdks.mdx` warning and restore `generate.yml`'s triggers. |
| The `aeo` skill installs from `redemptia/redemptia`; the step that installed it from elmo's website and its `apps/www/scripts/build-agent-skills.mjs` path trigger are dropped. `skills/aeo/references/elmo.md` is `references/redemptia.md`, its provider links carry no affiliate codes, and its provider comparisons are credited to elmo's measurements. | `.github/workflows/skill-install.yaml`, `scripts/check-skill-install.sh`, `skills/aeo/**` (#79) | Our `www` doesn't build or publish the `aeo` skill. The skill's id comes from `SKILL.md`'s `name: aeo`, not the path, so the rename doesn't change how it installs. The GitHub install step runs only on the weekly schedule or a manual dispatch, never on a pull request or a push, so a change to it is first exercised by the next Monday run or by `gh workflow run skill-install.yaml`. |
| The marketing site, `apps/www/**`, is ours wholesale, and stays at version `0.4.4` while the rest of the workspace is at elmo's `0.7.3`. elmo's `.claude/skills/add-competitor/SKILL.md`, which documents how to edit the directory data under `apps/www`, stays ours with it. | `apps/www/**`, `.claude/skills/add-competitor/SKILL.md` (#61, #67, #69–#74, #79, #99) | It carries our brand, colour, copy and pricing. Holding the version kept it byte-identical through the merge; no CI check compares workspace versions, and the changesets `fixed` group lifts it at the next release. **When merging:** take ours for every file, and `git rm` every file elmo added there; keep our `add-competitor` skill, which documents our directory's fields. elmo's directory changes come over separately, in a port PR that re-applies the rebrand by hand (#97, #100), and the skill moves with them. |
| elmo's blog posts (58 at `20954aa2`) and its 5 legal pages (Terms, Privacy, Cookies, Subprocessors and Acceptable Use) stay deleted, and `packages/config/src/legal.ts` with them. | `packages/docs/content/blog/**`, `packages/docs/content/legal/**`, `packages/config/src/legal.ts` (#61, #79) | elmo's legal pages describe elmo's company. Merged back, they would publish elmo's Terms, Privacy and Subprocessors under `redemptia.in`: a legal exposure, not a branding slip. **When merging:** delete every file elmo adds or changes under these paths. |
| One elmo test, `adaptivePool`'s six-minute simulation in `apps/worker/src/mention-judge/jev.test.ts`, has a 30 s timeout. | `apps/worker/src/mention-judge/jev.test.ts` (#79) | It is CPU-bound: under 1 s alone, past vitest's 5 s default when every package's suite runs at once. |

## Brand Perception

Brand Perception is built on top of elmo rather than into it. Its prompts are ordinary rows in `prompts`, marked as
perception prompts by a row in our own `perception_prompts` table. Every perception table lives in
`packages/lib/src/db/schema-perception.ts`.

**Never edited for perception:** `packages/lib/src/db/schema.ts`, which stays identical to elmo's so that
`git diff upstream/main -- schema.ts` is clean when migrations are renumbered; `analyze.ts`, `jev.ts`,
`derive-runs.ts`, `analysis-versions.ts`, `mentions.ts`, `rebuild.ts`; the `run_mentions.assessments` column; and every
existing rollup table.

**Tables:** `perception_prompts` (0032); `perception_attributes`, `perception_attribute_versions`, `brand_facts`,
`perception_verdicts`, `rollup_perception_daily` and `perception_stamps` (0033); `perception_jev_calls`,
`perception_run_status` and `perception_rollup_dirty` (0034). None touches an elmo table except
through foreign keys to `brands`, `prompts` and `prompt_runs`. `brand_facts` is immutable by trigger.

**Not a marker:** `prompts.system_tags` is rewritten from the prompt text by every prompt save and by the worker's
reprocess pass, and users can delete `prompts.tags`. A marker in either would be lost, and the prompt would silently
join the headline metrics.

### Tables

| File | Change | Why |
|---|---|---|
| `packages/lib/drizzle.config.ts` | `./src/db/schema-perception.ts` added to `schema` | So drizzle-kit generates our tables. One upstream commit in six months |
| `packages/lib/package.json` | an `exports` line for `./db/schema-perception` | So the apps can import our tables. Of 88 upstream commits to this file in six months, 18 touched `exports`, so a conflict here is possible; keep both sides |

### The perception job

| File | Change | Why |
|---|---|---|
| `apps/worker/src/index.ts` | one `await registerPerceptionJobs(boss)` line, after `registerHandlers` | The job runs inside elmo's worker, because a separate process would need a compose service, a Docker target and a published image. `registerPerceptionJobs` (`apps/worker/src/perception/register.ts`) creates its own queue and schedule and never throws, so a failure there can't stop the worker. It does nothing in cloud. A response from a Jev model other than the pinned `JEV_MODEL` counts as a failed call and writes nothing, so a judge version can't change under a stamp silently. |

### Headline exclusion

Visibility, share of voice, position, sentiment, the overview cards and the Opportunities digest leave perception
prompts out. Citations, Query Fan-Out and Responses keep them, because they are the evidence perception rests on. The
exclusion is the default where prompt lists are built (`perceptionPromptScope` in
`apps/web/src/server/perception-scope.ts`), so a headline page elmo adds later leaves perception prompts out without
an edit; only the evidence surfaces opt in. With no `perception_prompts` rows, every query returns what elmo's does.

| File | Change | Why |
|---|---|---|
| `apps/web/src/server/prompt-resolution.ts` | `resolveFilteredPrompts` leaves perception prompts out unless passed `includePerception` | Visibility (`visibility.ts`), the overview cards (`dashboard.ts`) and the Opportunities digest (`opportunities.ts`) resolve their prompts here, so they need no edit of their own |
| `apps/web/src/server/analytics-core.ts` | `resolveScope` takes `includePerception`. `getBrandCitations` defaults it to `true` and `getBrandQueryFanout` always passes `true`; every other function keeps the default. `getBrandAnalytics` asks `getBrandCitations` for `false` | The REST and MCP citation and fan-out endpoints are evidence. `getBrandAnalytics` (REST `/analytics`, MCP `get_analytics`) is a headline summary, and its `uniqueDomains` and `uniqueUrls` would otherwise count perception answers beside visibility figures that don't |
| `apps/web/src/server/prompts.ts` | `getPromptsSummaryFn` leaves perception prompts out unless passed `includePerception` | It lists prompts for the Visibility, Share of Voice, Sentiment and Overview pages as well as for Responses and Query Fan-Out |
| `apps/web/src/server/responses.ts` | `resolveSearch` includes perception prompts only when the user picks prompts | The header ("N answers") is a brand-level number; without a pick it matches the headline pages |
| `apps/web/src/hooks/use-prompts-summary.tsx`, `apps/web/src/routes/_authed/app/org/$org/brand/$brand/responses.tsx`, `.../query-fan-out.tsx` | pass `includePerception` through, and set it on the two evidence pages | So the Responses prompt picker and the Query Fan-Out tag list include perception prompts |
| `apps/web/src/routes/_authed/app/org/$org/brand/$brand/settings/prompts.tsx` | the editor's loader leaves perception prompts out | A prompt the editor never loads is never submitted, so a bulk save can't disable or reword it. REST and MCP can still change them: those are explicit API calls |

**Left as they are, and why:** `platform-picks.ts` projects cost over every enabled prompt, perception included,
because perception runs cost money. `admin.ts`, quota and billing counts, REST `/api/v1/prompts` and MCP
`list_prompts`/`update_prompt` include perception prompts, because they count or manage rows rather than report a
metric. The dashboard Citations page builds its own prompt list (`citations.ts`), so it includes perception prompts
with no edit.

**Known gap:** the prompt editor's client-side cap counts the rows it shows, but `decidePromptCap` counts every
prompt of the brand, perception prompts included. Near 100 prompts, the editor can let a user add rows that the save
then refuses.

**When merging:** a new elmo query that lists a brand's prompts for a metric, without going through
`resolveFilteredPrompts` or `getPromptsSummaryFn`, includes perception prompts. Check any new
`.from(prompts)` in `apps/web/src/server/` and add `perceptionPromptScope()` if it feeds a headline number.

## Merging upstream

Catching up is a 3-way merge of `upstream/main` into `main`, landed through a PR as a merge commit. Never replay our
work onto upstream (the rebrand was editorial, not mechanical), never rebase, never squash.

**Cadence (standing rule).** Every Monday, run steps 1 and 2: re-pin, and trial the merge in a scratch clone. Catch
up that same week if elmo has added **any migration**, or **25 or more commits**, since the last pin. Never let two
weeks pass without a catch-up.

- **Why weekly.** Between `39d4700d` and `20954aa2`, elmo averaged about 7 commits a day, accelerating to 26 on the
  last day, shipped five releases (0.6.1 to 0.7.2) in two days, and added five migrations in two days.
- **Why not per release or monthly.** Per release would mean several catch-ups a day. Monthly would mean about 200
  commits, twice the 94 that made the first catch-up hard.
- **Why a migration triggers early.** Every migration we add makes each elmo migration still waiting, if it's dated
  before ours, a silent skip (see [Migrations](#migrations)). The shorter that wait, the fewer migrations to
  regenerate.
- Monday is also when `skill-install.yaml` runs on its schedule.

1. **Re-pin.** `git fetch upstream`, then `git rev-parse upstream/main` and `git rev-list --count <last pin>..upstream/main`.
   `git merge-base main upstream/main` must be the last pin above. Pin the new SHA; don't merge a moving branch.
2. **Trial first.** In a scratch clone, `git merge --no-commit --no-ff <pin>`, then count changed and conflicted files
   and bucket the conflicts as below before resolving anything in the real tree.
3. **Policy buckets.**
   - `apps/www/**` and `.claude/skills/add-competitor/SKILL.md`: ours, and `git rm` every file elmo added.
   - `packages/docs/content/{blog,legal}/**` and `packages/config/src/legal.ts`: deleted, including files elmo added.
   - `packages/config/src/referrals.ts` and its test, `CONTRIBUTING.md`: ours.
   - Package manifests: elmo's versions and dependencies, our names (`@redemptia/cli`, its `redemptia` bin).
   - `pnpm-lock.yaml`: take elmo's, run `pnpm install --lockfile-only`, then `pnpm install --frozen-lockfile` must pass
     and resolve a single React.
   - `packages/docs/content/docs/**`: merge, keeping elmo's new pages with our names.
4. **The provenance rule, for every other conflicted hunk.** Find which of our changes the hunk carries. If it is one
   of these, keep ours (or merge ours into elmo's new code): #6, #8, #11, #23 (fixes); #61, #67 (rebrand); #41, #44,
   #63, #75 (ours by origin: `CLAUDE.local.md` and `/docs/` ignores, CLA removal, our README, SECURITY and
   CONTRIBUTING); and the #79 decisions in the table above (ad tags out, SDK names, skill install source, lock and
   claim names). Otherwise take elmo's. **A hunk that maps to none of them is a decision, not a resolution:** stop,
   decide it, and record it in the table.
5. **Check provenance before taking elmo's side of a whole file.** `git log <last pin>..main -- <file>`: if it shows
   #61 or #67, hand-edit, because taking elmo's file silently undoes the rebrand.
6. **CI workflows are per hunk.** Keep our `runs-on` lines and the two migration checks in `build.yaml`; take
   everything else of elmo's. A new elmo workflow on a Blacksmith runner moves to `ubuntu-24.04` if it runs on PRs.
7. **Gate on the silent arrivals.** Files elmo added under `apps/www` or blog/legal arrive without a conflict. Before
   committing, `git diff --stat <pre-merge main> -- apps/www packages/docs/content/blog packages/docs/content/legal`
   must print nothing.
8. **Migrations:** follow the merge procedure in [Migrations](#migrations). Its upgrade check compares `pg_indexes`
   before and after, and against the latest snapshot. Never conclude from the migration SQL alone that no index was
   lost: dropping a column drops every index that uses it, `INCLUDE` columns too, with no `DROP INDEX` (#86).
9. **Rebrand sweep** over everything elmo changed: `git grep -n -E "elmo|Elmo|elmohq|ELMO"`. Allowed to remain: the
   never-rename names in `CLAUDE.md`, every `CHANGELOG.md`, `pnpm-lock.yaml`, `LICENSE.md`, `CITATION.cff`, this
   file, the third-party version `hey-api@0.1.0-elmo.4` in `generate.yml` (a package version, never "fix" it), test
   fixtures that use Elmo as a sample brand name in answer text, substrings of other words in
   `packages/lib/src/citations/editorial-domains.ts`, `apps/www`'s Elmo directory entry and the README's origin
   credit. Search for escaped forms too (`` \`elmo ``): one hid in a template literal last time.
10. **Land it** as a PR merged with `gh pr merge --merge`. A squash drops elmo's commits as a parent, so the next
    merge re-conflicts on everything and `git revert -m 1` no longer works.

## Migrations

drizzle's migrator ignores filenames and journal `idx`. It applies a migration only if its journal `when` is newer
than the newest migration the database has already applied, and skips the rest with no error or warning.

**Where we stand.** Migrations 0000–0030 are elmo's, from the `20954aa2` catch-up. 0031,
`0031_prompt_runs_brand_created_at_idx` (journal `when` `1792295862959`, 18 October 2026), and 0032,
`0032_perception_prompts` (journal `when` `1792681629886`, 22 October 2026) 0033, `0033_perception_core_tables` (journal `when`
`1792728759177`), and 0034, `0034_perception_job_tables`, are ours. 0034's journal `when` is **`1792755949381`** (23 October 2026).
0033 also carries a hand-written trigger, `brand_facts_immutable`, that drizzle doesn't track: never regenerate 0033, and
keep that SQL if anything ever touches it.
Every deployed database that has run it records that `when` as its newest. That has two consequences for every catch-up
from now on:

- **Elmo's next four migrations are also numbered 0031–0034.** Both sides add those snapshots and journal entries
  with `idx` 31–34, so git reports conflicts. That's the loud half, and it's fine.
- **Any elmo migration whose `when` is older than ours is skipped on those databases, silently.** Elmo writes its
  `when` when it generates the migration, so anything elmo authored before 23 October 2026 that we haven't merged
  yet is in this position, as is anything dated before our newest migration once we add more. A fresh database
  still applies it, so a fresh test passes while every upgraded deployment lacks the change. Only the upgrade check
  in step 5 below sees it.

Our migrations stay where they are: deployed databases have applied them, and the migrator knows them by `when` and
the hash of their SQL. **Elmo's migrations move**: they are renumbered after ours and re-dated, every catch-up.

**Adding one of ours:**

1. Change `schema.ts`, then `pnpm -C packages/lib exec drizzle-kit generate --name <what_it_does>`. Without `--name`
   drizzle-kit picks a random file name. Never `drizzle-kit push`.
2. SQL that `generate` can't produce, such as renaming an index the snapshot already calls by its new name, goes in
   the generated file, separated by `--> statement-breakpoint`, with a comment saying why. `drizzle-kit generate` must
   still report "No schema changes" afterwards.
3. An index drizzle can't declare (`INCLUDE`, or one on a better-auth table) goes in `RAW_INDEXES` in
   `packages/lib/scripts/index-census.mjs`.
4. Check its journal `when` is newer than every entry already in `meta/_journal.json`.
5. Run the upgrade check locally from `main`'s migrations (step 5 of the merge procedure below). It must print both
   "All N migrations applied" and "All N indexes match".
6. Record it in the table above, and update **Where we stand** with its number and `when`.

**Merging elmo's, in this order.** These steps were rehearsed in a scratch clone: a fake elmo 0031 dated before our
0031, merged into `main`.

1. **List elmo's new entries:** `git diff <last pin> <pin> -- packages/lib/src/db/migrations/meta/_journal.json`.
   Note each one's tag and `when`.
2. **Keep ours.** Resolve `meta/_journal.json` and every conflicting `meta/<n>_snapshot.json` to our side. Remove
   elmo's new migration files from the merge (`git rm` each new `.sql`, and drop its snapshot). Keep elmo's
   `schema.ts` changes, which merge like any other code.
3. **Regenerate elmo's changes on top of ours:** `pnpm -C packages/lib exec drizzle-kit generate --name <elmo's tag
   without its number>`, one per elmo migration, in elmo's order. This gives each a number after ours, a current
   `when`, and a snapshot whose `prevId` is our latest. The rehearsal covered one elmo migration. For several, applying elmo's
   `schema.ts` changes one migration at a time should keep the split, but that hasn't been rehearsed.
4. **Put elmo's SQL back.** Replace each generated `.sql` with elmo's original text, comments included. In the rehearsal
   the generated SQL was byte-identical to elmo's. If it isn't, elmo's file has hand-written SQL that `generate` can't
   produce, and elmo's text is the one to keep. `drizzle-kit generate` must then report "No schema changes".
5. **Prove it.** `node packages/lib/scripts/check-migrations.mjs <pre-merge migrations dir> packages/lib/src/db/migrations`
   against a scratch `_test` database must print "All N migrations applied" and "All N indexes match the latest
   snapshot and RAW_INDEXES, and none was lost on upgrade", and a fresh `_test` database must apply every journal
   entry. CI runs the first as "Migrations apply on upgrade from the base commit". It is the only thing that catches
   a migration drizzle skipped, an index a dropped column took with it, or an index whose name drifted from the
   snapshot's. In the rehearsal, keeping elmo's file with its original `when` passed a fresh database and failed
   this check with "did not apply on upgrade from the base branch".
6. **Record the offset.** In the table above, note which of elmo's migrations now have which of our numbers. The
   next catch-up repeats steps 2–5 for each migration elmo adds after the pin, because elmo's numbering stays
   behind ours from here on.

**Index builds lock writes.** drizzle runs every migration in one transaction, so `CREATE INDEX CONCURRENTLY` isn't
possible through it, and an index migration blocks writes to its table while the index builds. That's acceptable
while there are no production users. On a large table, use this escape hatch:

1. Build the index by hand, outside drizzle: `CREATE INDEX CONCURRENTLY IF NOT EXISTS ...`, with the same statement as the migration file.
2. Mark the migration applied: `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('<sha256 hex of the .sql file>', <its journal when>);`
3. Run the migrator as usual. The recorded `created_at` equals the migration's `when`, so it skips the migration.

## Known gaps

- [#16](https://github.com/redemptia/redemptia/issues/16): response search over `run_extractions.text_content` still reads
  every in-scope answer: `pg_trgm` isn't installed, `run_extractions` has only its primary key, and `count(*) OVER ()`
  reads every match before the page limit. #79 fixed correctness; the performance half is upstream's shape.
- [#26](https://github.com/redemptia/redemptia/issues/26): share of voice's `getPerPromptDailyCompetitors` takes ~692 ms at
  ~566k rollup rows. The 15-minute buckets barely compress (about one row per run per competitor), the query reduces
  them to ~251k groups, sorts on a text key, spills ~12 MB at the default `work_mem`, and returns all 251k rows.
  **Not the same as #88**: #88 is join cost on the Responses page, #26 is a group-and-sort in share of voice.
- [#91](https://github.com/redemptia/redemptia/issues/91): nothing ages out run data; `prompt_runs`, `raw_output`,
  extractions, mentions, citations and rollups grow forever.
- [#88](https://github.com/redemptia/redemptia/issues/88): Responses deep pages and sentiment counts are join-bound,
  about 90 ms at 4.4M runs, with or without an index.
- [#85](https://github.com/redemptia/redemptia/issues/85): Jev judging has no spend cap, and a first real `TYPESAFE_API_KEY` starts four paid
  paths at once (worker start, reprocessing on change, stub-to-real re-judging, subject recasing).
- [#78](https://github.com/redemptia/redemptia/issues/78): competitor names aren't unique per brand, and a dashboard
  save re-creates the list (elmo's behaviour, back since #77).
- [#80](https://github.com/redemptia/redemptia/issues/80): the cookie banner asks for an Advertising category nothing
  reads, and `packages/ui/src/lib/idle.ts` is unused.
- [#83](https://github.com/redemptia/redemptia/issues/83): the CLI's Docker Hub images don't exist, and the published
  `@redemptia/cli@0.4.4` predates the `TYPESAFE_API_KEY` prompt.
- The Sentiment page is empty until runs are judged. Judging with a real `TYPESAFE_API_KEY` is paid, and setting one
  is a separate, explicit decision.
