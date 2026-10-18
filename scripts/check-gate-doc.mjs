// Fails when CLAUDE.md's gate map has drifted from the workflows: every job a
// pull request runs, and every step of build.yaml that runs a command, must be
// named between the gate markers. The documented gate went stale twice by
// being maintained by hand.
//
// Usage: node scripts/check-gate-doc.mjs [repo-root]

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const START = "<!-- gate:start -->";
const END = "<!-- gate:end -->";

/** The workflows' YAML is regular enough to read by indentation, which saves a parser dependency. */
function triggersOnPullRequest(source) {
	const on = source.match(/^on:\n((?:[ \t]+.*\n|\n)*)/m);
	return Boolean(on && /^ {2}pull_request:/m.test(on[1]));
}

/** A job's check is named by its `name:`, or by its id when it has none. */
function jobNames(source) {
	const jobs = source.match(/^jobs:\n([\s\S]*)/m);
	if (!jobs) return [];
	return jobs[1]
		.split(/^(?= {2}[\w-]+:\s*$)/m)
		.map((block) => {
			const id = block.match(/^ {2}([\w-]+):\s*$/m);
			const name = block.match(/^ {4}name: (.+)$/m);
			return id && (name ? unquote(name[1]) : id[1]);
		})
		.filter(Boolean);
}

function commandStepNames(source) {
	const names = [];
	for (const step of source.split(/^ {6}- /m).slice(1)) {
		const name = step.match(/^name: (.+)$/m);
		if (name && /^ {8}(run|uses):|^ {10}command:/m.test(step) && !/^ {8}uses: (actions|pnpm)\//m.test(step)) {
			names.push(unquote(name[1]));
		}
	}
	return names;
}

const unquote = (value) => value.trim().replace(/^(["'])(.*)\1$/, "$2");

export function missingFromGate(root) {
	const doc = readFileSync(join(root, "CLAUDE.md"), "utf8");
	const start = doc.indexOf(START);
	const end = doc.indexOf(END);
	if (start === -1 || end < start) return [`CLAUDE.md has no ${START} … ${END} block`];
	const gate = doc.slice(start, end);

	const dir = join(root, ".github/workflows");
	const expected = [];
	for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
		const source = readFileSync(join(dir, file), "utf8");
		if (!triggersOnPullRequest(source)) continue;
		for (const job of jobNames(source)) expected.push({ what: `job "${job}" (${file})`, text: job });
		if (file === "build.yaml") {
			for (const step of commandStepNames(source)) expected.push({ what: `build.yaml step "${step}"`, text: step });
		}
	}
	return expected.filter(({ text }) => !gate.includes(text)).map(({ what }) => what);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	const missing = missingFromGate(process.argv[2] ?? process.cwd());
	for (const what of missing) console.error(`::error::CLAUDE.md's gate map doesn't name ${what}.`);
	if (missing.length > 0) process.exit(1);
	console.log("CLAUDE.md's gate map names every pull-request job and every build.yaml step.");
}
