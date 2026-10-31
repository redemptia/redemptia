/**
 * What must hold before a real `TYPESAFE_API_KEY` goes in, and what the first real job would cost.
 * Pure, so the preflight script's rules are tested without a database.
 */
import { perceptionAvailableIn } from "@workspace/lib/perception/limits";

export interface Check {
	name: string;
	ok: boolean;
	detail: string;
}

const MODES_WITHOUT_PERCEPTION = ["demo", "cloud"];

export function checkEnvironment(env: { mode?: string; key?: string; associationEnabled: boolean }): Check[] {
	const mode = env.mode?.trim().toLowerCase();
	const key = env.key?.trim();
	const real = !!key && key !== "stub";
	const checks: Check[] = [];

	if (!mode) checks.push({ name: "Deployment mode", ok: false, detail: "DEPLOYMENT_MODE is not set" });
	else if (!perceptionAvailableIn(mode))
		checks.push({ name: "Deployment mode", ok: false, detail: `${mode}: perception runs only in local or whitelabel` });
	else checks.push({ name: "Deployment mode", ok: true, detail: mode });

	if (real && mode && MODES_WITHOUT_PERCEPTION.includes(mode))
		checks.push({
			name: "Key suits the mode",
			ok: false,
			detail: `a real key is set while DEPLOYMENT_MODE is ${mode}`,
		});
	else
		checks.push({
			name: "Key suits the mode",
			ok: true,
			detail: real ? "real key, perception mode" : "no real key set",
		});

	if (!key) checks.push({ name: "Judge key", ok: false, detail: "TYPESAFE_API_KEY is not set" });
	else if (key === "stub")
		checks.push({ name: "Judge key", ok: false, detail: "TYPESAFE_API_KEY is stub; the flip needs a real key" });
	else checks.push({ name: "Judge key", ok: true, detail: `set (${key.length} characters)` });

	checks.push({
		name: "Association stays off",
		ok: !env.associationEnabled,
		detail: env.associationEnabled ? "ASSOCIATION_ENABLED is true" : "ASSOCIATION_ENABLED is false",
	});
	return checks;
}

/** Every migration in the journal must be recorded as applied; drizzle skips older ones silently. */
export function checkMigrations(journal: { tag: string; hash: string }[], appliedHashes: Set<string>): Check {
	const missing = journal.filter((migration) => !appliedHashes.has(migration.hash));
	const latest = journal[journal.length - 1]?.tag ?? "none";
	const next = String(journal.length).padStart(4, "0");
	return missing.length === 0
		? { name: "Migrations", ok: true, detail: `all ${journal.length} applied, latest ${latest} (next number ${next})` }
		: {
				name: "Migrations",
				ok: false,
				detail: `${journal.length - missing.length} of ${journal.length} applied; missing ${missing.map((m) => m.tag).join(", ")}`,
			};
}

/** $0.042 per million tokens, from the Jev quote in CONSIDERATIONS; per-question pricing is still open. */
export const JEV_USD_PER_MILLION_TOKENS = 0.042;
/** Characters the judge reads of an answer, at most (MAX_ANSWER_CHARS), and a rough size for the questions. */
export const QUESTION_TOKENS = 1_100;
/** Elmo's mention judge, roughly, per run (apps/worker/scripts/audit-replay.ts). */
export const ELMO_JUDGE_USD_PER_RUN = 0.0002;
const CHARS_PER_TOKEN = 4;
const MAX_ANSWER_CHARS = 20_000;

export interface FirstJobCount {
	perception: { class: string; runs: number; avgRawChars: number }[];
	stubJudgedRuns: number;
	unjudgedRuns: number;
}

export function projectFirstJob(count: FirstJobCount) {
	const runs = count.perception.reduce((sum, row) => sum + row.runs, 0);
	const tokens = count.perception.reduce(
		(sum, row) => sum + row.runs * (Math.min(row.avgRawChars, MAX_ANSWER_CHARS) / CHARS_PER_TOKEN + QUESTION_TOKENS),
		0,
	);
	// An upper bound: unjudged runs include answers that name no tracked company, which Elmo never judges.
	const elmoRuns = count.stubJudgedRuns + count.unjudgedRuns;
	return {
		perceptionRuns: runs,
		perceptionUsd: (tokens / 1_000_000) * JEV_USD_PER_MILLION_TOKENS,
		elmoRunsUpperBound: elmoRuns,
		elmoUsdUpperBound: elmoRuns * ELMO_JUDGE_USD_PER_RUN,
	};
}
