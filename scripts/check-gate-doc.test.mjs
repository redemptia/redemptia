import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { missingFromGate } from "./check-gate-doc.mjs";

const REPO = fileURLToPath(new URL("..", import.meta.url));

function repoWith(workflows, gate) {
	const root = mkdtempSync(join(tmpdir(), "check-gate-doc-"));
	mkdirSync(join(root, ".github/workflows"), { recursive: true });
	for (const [file, source] of Object.entries(workflows)) writeFileSync(join(root, ".github/workflows", file), source);
	writeFileSync(join(root, "CLAUDE.md"), `# Gate\n\n<!-- gate:start -->\n${gate}\n<!-- gate:end -->\n`);
	return root;
}

const BUILD = `name: Build
on:
  pull_request:
    branches: [main]
jobs:
  build:
    name: Build
    steps:
      - name: Checkout
        uses: actions/checkout@v7
      - name: Unit tests
        run: pnpm turbo test
      - name: Storybook tests
        run: pnpm -C apps/web test:storybook
`;

test("CLAUDE.md's gate map names every check this repository's pull requests run", () => {
	assert.deepEqual(missingFromGate(REPO), []);
});

test("a build step missing from the map is reported, and setup actions aren't required", () => {
	const root = repoWith({ "build.yaml": BUILD }, "| **Build** | Unit tests |");
	assert.deepEqual(missingFromGate(root), ['build.yaml step "Storybook tests"']);
});

test("a job without a name is required under its id, and workflows that don't run on pull requests are ignored", () => {
	const root = repoWith(
		{
			"smoke.yaml": "on:\n  pull_request:\njobs:\n  smoke:\n    runs-on: ubuntu-24.04\n",
			"nightly.yaml": "on:\n  schedule:\n    - cron: 0 0 * * *\njobs:\n  nightly:\n    name: Nightly\n",
		},
		"nothing here",
	);
	assert.deepEqual(missingFromGate(root), ['job "smoke" (smoke.yaml)']);
});
