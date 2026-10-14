<p align="center">
  <a href="https://github.com/redemptia/redemptia">
    <img src="apps/www/public/brand/logos/redemptia-logo-xl.png" alt="Redemptia" width="300">
  </a>
</p>

<p align="center">
  Open source AI visibility tracking and optimization.
  <br />
  <br />
  <a href="https://redemptia.example/"><strong>Learn more »</strong></a>
</p>

<br />

<p align="center">
  <a href="https://redemptia.example/docs"><img src="https://img.shields.io/badge/Docs-2563eb?style=flat&logo=readthedocs&logoColor=white" alt="Docs"></a>&nbsp;
  <a href="https://demo.redemptia.example"><img src="https://img.shields.io/badge/Demo-22c55e?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNSAxNGMuMi0xIC43LTEuNyAxLjUtMi41IDEtLjkgMS41LTIuMiAxLjUtMy41QTYgNiAwIDAgMCA2IDhjMCAxIC4yIDIuMiAxLjUgMy41LjcuNyAxLjMgMS41IDEuNSAyLjUiLz48cGF0aCBkPSJNOSAxOGg2Ii8+PHBhdGggZD0iTTEwIDIyaDQiLz48L3N2Zz4%3D" alt="Demo"></a>&nbsp;
  <a href="https://github.com/redemptia/redemptia/issues"><img src="https://img.shields.io/badge/Issues-f95738?style=flat&logo=github&logoColor=white" alt="Issues"></a>&nbsp;
  <a href="https://github.com/orgs/redemptia/projects/3/views/1"><img src="https://img.shields.io/badge/Roadmap-ee964b?style=flat&logo=github&logoColor=white" alt="Roadmap"></a>&nbsp;
</p>

<br />

## About

Redemptia is an open-source, self-hosted platform for optimizing your AI visibility, which is also known as:
* Answer Engine Optimization (AEO)
* Generative Engine Optimization (GEO)
* LLM Optimization (LLMO, which is where the name Redemptia is from)

Redemptia tracks how AI answer engines like ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews mention, cite, and describe your brand, so you can benchmark competitors and grow your visibility in AI answers.

It's a free alternative to tools like [Profound](https://redemptia.example/ai-visibility-tools/redemptia-vs-profound), [Peec](https://redemptia.example/ai-visibility-tools/redemptia-vs-peec-ai), and [Otterly](https://redemptia.example/ai-visibility-tools/redemptia-vs-otterly-ai). You can run it on your own infrastructure, own your data, and audit exactly how every metric is calculated.

## Demo

Try the live demo at **[demo.redemptia.example](https://demo.redemptia.example)** to see how Redemptia tracks prompts and analyzes citations.

## Screenshots

| Dashboard overview | Visibility tracking |
|---|---|
| ![Redemptia dashboard showing visibility score, tracked prompts, and trend charts](apps/www/public/screenshots/overview.png) | ![Per-prompt AI visibility scores and trends across answer engines](apps/www/public/screenshots/visibility.png) |
| **Share of voice** | **Citation analysis** |
| ![Competitor share of voice leaderboard and trend over time](apps/www/public/screenshots/share-of-voice.png) | ![Domains and URLs cited by AI answer engines, grouped by category](apps/www/public/screenshots/citations.png) |
| **Query fan-out** | **Opportunities** |
| ![Web searches AI engines ran while grounding answers to tracked prompts](apps/www/public/screenshots/query-fan-out.png) | ![Generated recommendations for earning more AI citations](apps/www/public/screenshots/opportunities.png) |

## What Redemptia Tracks

- **Visibility scoring** — For every tracked prompt, Redemptia measures how often each AI answer engine mentions your brand and trends the score over time, per prompt and per model.
- **Brand mention tracking** — Each answer is checked for your brand name, aliases, and domains, so mentions are counted the same way every time, across every engine.
- **Citation analysis** — Every URL an engine cites is stored with its domain and position, then categorized: your own domains, competitor domains, social media, Google properties, and institutional sources. You see which pages AI models actually trust for your industry.
- **Competitor benchmarking and share of voice** — A leaderboard of competitor mention rates next to your own, with your overall share of voice and how it moves over time.
- **Query fan-out analysis** — When an answer engine grounds a response, it often runs several web searches first. Redemptia records those searches, shows how engines rewrite your wording (which words they add, drop, or keep), and which searches your content wins or misses.
- **Prompt management** — An onboarding wizard analyzes your website, then suggests keywords, competitors, buyer personas, and tracking prompts. You can also add prompts manually, tag them, and enable or disable them individually.
- **Opportunities** — Redemptia turns your tracked visibility and citation data into a prioritized, regularly refreshed list of what to create, pitch, and seed to earn more AI citations.
- **Reports** — Shareable AI visibility reports (visibility summary, per-prompt breakdown, citation analysis, competitor comparison) viewable by stakeholders without an Redemptia account.
- **REST API** — Manage brands, prompts, and competitors and pull analytics snapshots and reports programmatically. See the [API reference](https://redemptia.example/docs/api).

## How Redemptia Measures AI Visibility

Redemptia's methodology is simple and fully inspectable in this repository:

1. **Prompts are defined per brand** — either generated by the onboarding wizard from your website or written by hand. Each prompt is a question a potential customer might ask an AI assistant.
2. **A background worker runs each prompt on a schedule** (several times a day by default) against every engine you configure. Scraping providers capture the real consumer surfaces — ChatGPT, Google AI Mode, Google AI Overviews, Gemini, Perplexity, and Microsoft Copilot — while direct model APIs (OpenAI, Anthropic, Mistral, OpenRouter) add coverage for Claude, Grok, and other models with web search enabled. The [providers guide](https://redemptia.example/docs/user-guide/providers) compares both approaches and their costs.
3. **Every answer is normalized and parsed.** Each run produces the answer text, the list of cited URLs, the web searches the engine ran while grounding (its query fan-out), and the model version. The text is scanned for your brand's name, aliases, and domains, and for each competitor's.
4. **Everything is stored in PostgreSQL**, including the raw engine output, so any metric can be re-derived and audited later. Nothing is a black box: the mention detection, scoring, and aggregation code is all in this repo.
5. **Metrics are aggregated into trends.** Visibility is the share of runs that mention your brand; share of voice compares your mention rate against competitors; citation counts roll up by URL, domain, and category — each filterable by prompt, tag, engine, and time range.

Because Redemptia is open source, this loop is the part you never have to take on faith. Answer Engine Optimization (AEO) tooling lives or dies on measurement quality, and Redemptia's measurements are ones you can read, run, and verify.

## Redemptia vs. Closed-Source Alternatives

Most AI visibility platforms are closed SaaS. Here is how Redemptia compares to the widely used ones:

| Tool | Open source | Self-hostable | Auditable metrics | Data ownership | Pricing model | Engine coverage |
|---|---|---|---|---|---|---|
| **Redemptia** | Yes (MIT) | Yes (Docker Compose) | Yes — scoring code is public | Yours — your own PostgreSQL | Free self-hosted; cloud from $29/mo | ChatGPT, Google AI Mode, Google AI Overviews, Gemini, Perplexity, Copilot, Claude, Grok, Mistral, and more |
| [Profound](https://redemptia.example/ai-visibility-tools/redemptia-vs-profound) | No | No | No — proprietary scoring | Vendor-hosted | Enterprise, custom pricing | Multiple engines, plus AI crawler analytics |
| [Peec AI](https://redemptia.example/ai-visibility-tools/redemptia-vs-peec-ai) | No | No | No | Vendor-hosted | Paid subscription, custom pricing | Multiple engines |
| [Otterly AI](https://redemptia.example/ai-visibility-tools/redemptia-vs-otterly-ai) | No | No | No | Vendor-hosted | Paid subscription, custom pricing | Multiple engines, plus on-page GEO audits |
| [Scrunch](https://redemptia.example/ai-visibility-tools/redemptia-vs-scrunch) | No | No | No | Vendor-hosted | Enterprise, custom pricing | Multiple engines; content-optimization focus |
| [Ahrefs Brand Radar](https://redemptia.example/ai-visibility-tools/redemptia-vs-ahrefs-brand-radar) | No | No | No | Vendor-hosted | From $129/mo | Multiple engines, tied to Ahrefs' SEO dataset |
| [Semrush AI Toolkit](https://redemptia.example/ai-visibility-tools/redemptia-vs-semrush-ai-toolkit) | No | No | No | Vendor-hosted | From $139.95/mo | Multiple engines, tied to Semrush's SEO platform |
| [HubSpot AEO Grader](https://redemptia.example/ai-visibility-tools/redemptia-vs-hubspot-aeo-grader) | No | No | No | Vendor-hosted | Free | One-time website audit, not continuous tracking |

To be fair about where the closed tools are genuinely ahead: Profound, Peec AI, Ahrefs, and Semrush offer prompt volume estimates; Peec AI, Ahrefs, and Semrush include sentiment analysis; Profound, Otterly, and Scrunch analyze AI crawler behavior; Otterly, Scrunch, and HubSpot audit and optimize on-page content; and Ahrefs and Semrush integrate AI tracking with established SEO datasets. Redemptia doesn't do those things today — see the [roadmap](https://redemptia.example/roadmap) for what's planned. What none of them offer is the ability to read the code behind every number, run it on your own infrastructure, and keep the data.

Redemptia also maintains a directory of 100+ Answer Engine Optimization and Generative Engine Optimization tools with feature matrices and head-to-head comparisons: [AI Visibility Tool Directory](https://redemptia.example/ai-visibility-tools).

## Who Redemptia Is For

- **Self-hosting teams** who want AI visibility data inside their own infrastructure — your prompts, your competitors, and every raw engine response stay in a PostgreSQL database you control.
- **Agencies** offering Answer Engine Optimization to clients: the white-label deployment adds custom branding, a custom domain, and SSO on top of multi-brand tracking.
- **Developers and analysts** who want auditable metrics — a REST API, a documented methodology, and a database you can query directly instead of a dashboard-only black box.
- **Anyone priced out of enterprise AEO platforms** who still needs credible measurement of how ChatGPT, Perplexity, Gemini, and Google AI Overviews talk about their brand.

## Quick Start

> [!TIP]
> **Would rather not self-host?** Redemptia Cloud runs the same open-source platform for you, with managed hosting and automatic updates, from $29/mo. [Start with Cloud →](https://redemptia.example/pricing)

For local deployments, use Docker Compose as configured with the `@redemptia/cli` package:

```bash
# Install the CLI globally
npm install -g @redemptia/cli

# Initialize configuration (interactive wizard)
redemptia init

# Start the stack
redemptia compose up -d
```

Once the services report healthy, open **http://localhost:1515** and create your account. The full walkthrough is in the [getting started guide](https://redemptia.example/docs/getting-started).

> [!TIP]
> **Watch** this repo's **releases** to get notified of major updates.

## Deployment Options

| Option | What you get | Price |
|---|---|---|
| **Self-hosted** | The full platform on your own infrastructure via Docker Compose, unlimited prompts, every supported engine and provider | Free (MIT) |
| **Redemptia Cloud** | Managed hosting with automatic updates, unlimited seats, and API access on every plan | From $29/mo |
| **White-label** | Everything in Cloud plus custom branding, a custom domain, and SSO — built for agencies serving multiple clients | Custom |

Details and plan limits are on the [pricing page](https://redemptia.example/pricing).

## Architecture

<p align="center">
  <img src="apps/www/public/brand/architecture.svg" alt="Redemptia system architecture" width="100%">
</p>

A web app serves the dashboard and REST API, a worker schedules and executes prompt runs against the AI engines, and PostgreSQL stores both the data and the job queue. The [developer guide](https://redemptia.example/docs/developer-guide) covers the monorepo layout and how to contribute.

## Tech Stack

- [Docker Compose](https://docs.docker.com/compose/)
- [PostgreSQL](https://www.postgresql.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [TanStack Start](https://tanstack.com/start/latest)
- [pg-boss](https://github.com/timgit/pg-boss)

## Documentation

- [Getting started](https://redemptia.example/docs/getting-started) — self-host Redemptia in under five minutes
- [User guide](https://redemptia.example/docs/user-guide) — brand setup, prompts, visibility, citations, and reports
- [Providers](https://redemptia.example/docs/user-guide/providers) — choosing scrapers and model APIs for each answer engine
- [Developer guide](https://redemptia.example/docs/developer-guide) — architecture, configuration, and contributing
- [API reference](https://redemptia.example/docs/api) — the REST API for brands, prompts, competitors, snapshots, and reports
- [AI Visibility Tool Directory](https://redemptia.example/ai-visibility-tools) — 100+ AEO/GEO tools compared

## Contact

- [Email](https://github.com/redemptia/redemptia/issues)

## Contributing

Interested in contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and CLA process, the [developer guide](https://redemptia.example/docs/developer-guide) for setup and architecture, and browse [good first issues](https://github.com/redemptia/redemptia/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) to get started.

## License

Redemptia is open source under the [MIT License](LICENSE.md).

## Repo Activity

![Repository activity](https://redemptia.example/repo-activity.svg "Repository activity")
