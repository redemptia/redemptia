<p align="center">
  <a href="https://github.com/redemptia/redemptia">
    <img src="https://raw.githubusercontent.com/redemptia/redemptia/main/apps/www/public/brand/logos/redemptia-logo-xl.png" alt="Redemptia" width="300">
  </a>
</p>

<p align="center">
  The official CLI for <a href="https://redemptia.example/">Redemptia</a> — open source AI visibility tracking and optimization.
  <br />
  <br />
  <a href="https://redemptia.example/docs"><strong>Read the docs »</strong></a>
</p>

<br />

<p align="center">
  <a href="https://www.npmjs.com/package/@redemptia/cli"><img src="https://img.shields.io/npm/v/@redemptia/cli?color=2563eb&label=npm" alt="npm version"></a>&nbsp;
  <a href="https://redemptia.example/docs"><img src="https://img.shields.io/badge/Docs-2563eb?style=flat&logo=readthedocs&logoColor=white" alt="Docs"></a>&nbsp;
  <a href="https://demo.redemptia.example"><img src="https://img.shields.io/badge/Demo-22c55e?style=flat&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJ3aGl0ZSIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Ik0xNSAxNGMuMi0xIC43LTEuNyAxLjUtMi41IDEtLjkgMS41LTIuMiAxLjUtMy41QTYgNiAwIDAgMCA2IDhjMCAxIC4yIDIuMiAxLjUgMy41LjcuNyAxLjMgMS41IDEuNSAyLjUiLz48cGF0aCBkPSJNOSAxOGg2Ii8+PHBhdGggZD0iTTEwIDIyaDQiLz48L3N2Zz4%3D" alt="Demo"></a>&nbsp;
  <a href="https://github.com/redemptia/redemptia"><img src="https://img.shields.io/github/stars/redemptia/redemptia?style=flat&logo=github&color=ee964b&label=Star" alt="GitHub stars"></a>&nbsp;
</p>

<br />

## What is Redemptia?

[Redemptia](https://redemptia.example/) is an open source platform for tracking and optimizing how your brand shows up in AI assistants like ChatGPT, Claude, Gemini, and Perplexity. Define the prompts your customers ask, run them across providers on a schedule, and get visibility into mentions, sentiment, citations, and competitor positioning over time.

`@redemptia/cli` is the fastest way to run Redemptia on your own infrastructure. It generates a Docker Compose stack, manages secrets and configuration, and gives you a single command to start, stop, and operate your instance.

## Installation

```bash
npm install -g @redemptia/cli
```

Requires [Docker](https://docs.docker.com/get-docker/) and Docker Compose.

## Quick Start

```bash
# 1. Walk through the interactive setup wizard
redemptia init

# 2. Start the stack
redemptia compose up -d

# 3. Open the app at http://localhost:1515
```

`redemptia init` will prompt you for a few things (database, AI provider credentials), generate `redemptia.yaml` and `.env`, and optionally start the stack for you.

For the full self-hosting walkthrough, see the [Redemptia docs](https://redemptia.example/docs).

## Commands

| Command | Description |
| --- | --- |
| `redemptia init` | Interactive wizard to set up a local Redemptia instance |
| `redemptia compose <args...>` | Run any `docker compose` command against your Redemptia project (e.g. `redemptia compose up -d`, `redemptia compose down`, `redemptia compose logs -f`, `redemptia compose build`, `redemptia compose ps`) |
| `redemptia edit <env\|compose>` | Change API keys, scrape targets, or the Docker Compose YAML |
| `redemptia upgrade` | Move your deployment to this CLI's version — runs migrations, re-pins image tags, and restarts the stack |

Run `redemptia --help` or `redemptia <command> --help` for the full list of flags.

### Useful flags

- `--dir <path>` — point any command at a specific config directory (defaults to `~/.redemptia`).
- `redemptia init --dev` — build images from a local checkout of the repo instead of pulling from the registry.

## Telemetry

The CLI sends anonymous install and command events so we can understand which flows people use and where setup breaks. To opt out, either export `DISABLE_TELEMETRY=1` in your shell, or add it to your `.env`:

```bash
redemptia edit env       # add DISABLE_TELEMETRY=1
redemptia compose up -d  # restart so the deployment picks it up
```

See [the telemetry docs](https://redemptia.example/docs/developer-guide/telemetry) for details on what is collected.

## Star, contribute, and chat

Redemptia is built in the open and we'd love your help.

- ⭐ **[Star us on GitHub](https://github.com/redemptia/redemptia)** — it genuinely helps more people find the project.
- 🐛 **[File an issue](https://github.com/redemptia/redemptia/issues)** if something breaks or you have a feature request.
