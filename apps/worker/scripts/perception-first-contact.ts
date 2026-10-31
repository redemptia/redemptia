#!/usr/bin/env tsx
/**
 * The staged first run against the real judge: one brand, a few prompts, a hard call budget, one pass, then it
 * stops. It judges a handful of the brand's existing fact answers without turning the brand on, keeps every
 * reply verbatim beside what the job did with it, and writes a report. Run it after the preflight and before
 * switching a brand on. Never loads .env.
 *
 *   Plan only (no calls, no writes):
 *     DATABASE_URL=... DEPLOYMENT_MODE=local TYPESAFE_API_KEY=... \
 *       pnpm perception:first-contact --brand <brandId>
 *   The run (spends, at most --max-calls calls, default 30, never more than 100):
 *     ... pnpm perception:first-contact --brand <brandId> --spend [--prompts 5] [--per-prompt 2] [--max-calls 30]
 *   After it, with what TypeSafe charged for the window the report names:
 *     pnpm perception:first-contact --report first-contact-<brand>-<time>.json --billed-usd <amount>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createDb } from "@workspace/lib/db/db";
import { ASSOCIATION_ENABLED } from "@workspace/lib/perception/association";
import pg from "pg";
import { JEV_MODEL, typesafeTransport } from "../src/mention-judge/jev";
import {
	DEFAULTS,
	type FirstContactReport,
	MAX_FIRST_CONTACT_CALLS,
	planFirstContact,
	runFirstContact,
	unitPrices,
} from "../src/perception/first-contact";
import { checkEnvironment } from "../src/perception/flip-checks";
import { migrationCheck } from "./migration-state";

const args = process.argv.slice(2);
const flag = (name: string) => {
	const i = args.indexOf(`--${name}`);
	return i >= 0 ? (args[i + 1] ?? "") : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const usd = (value: number) => `$${value < 0.01 ? value.toFixed(5) : value.toFixed(3)}`;

function priceReport(file: string, billed: number) {
	const report = JSON.parse(readFileSync(file, "utf8")) as FirstContactReport;
	const p = unitPrices(report, billed);
	console.log(`Window: ${report.startedAt} to ${report.finishedAt}. Billed ${usd(billed)} for ${p.calls} calls.`);
	console.log(`  per call:      ${usd(p.perCall)}   (${p.questionsPerCall.toFixed(1)} questions a call)`);
	console.log(`  per question:  ${usd(p.perQuestion)}`);
	console.log(
		`  per 1M tokens: $${p.perMillionTokens.toFixed(3)}   (${p.tokens} input tokens, ${p.tokensAreMeasured ? "measured" : "estimated"}; CONSIDERATIONS quotes $0.042)`,
	);
	console.log(`A day at perception's 2,000-call ceiling, at this run's averages: about ${usd(p.ceilingDayUsd)}.`);
	console.log(
		"To tell the three apart, look at TypeSafe's per-request charges for these calls: the same charge for a short and a long answer is per call or per question; a charge that follows the input tokens in the report is per token.",
	);
}

function printSummary(report: FirstContactReport, file: string) {
	const t = report.totals;
	console.log(`\nFirst contact for ${report.brandName} (${report.brandId}) at ${report.stamp}`);
	console.log(
		`  ${t.runs} answers, ${t.calls} calls (limit ${report.limits.maxCalls}), ${t.questions} questions, ${t.answerChars} answer characters`,
	);
	console.log(
		`  tokens: ${t.inputTokens === null ? "Jev reported no usage" : `${t.inputTokens} in, ${t.outputTokens} out`}`,
	);
	console.log(`  stopped: ${report.stoppedBecause}`);
	for (const run of report.runs) {
		const verdicts =
			run.ours.verdicts.map((v) => `${v.verdict}${v.skipped ? " (skipped)" : ""}`).join(", ") ||
			(run.ours.setAside?.outcome ?? "none") + (run.ours.setAside?.lastError ? `: ${run.ours.setAside.lastError}` : "");
		console.log(
			`  [${run.shape.join(", ")}] ${run.prompt.slice(0, 50)} -> ${verdicts}  (${run.calls.length} calls, skip rule: ${run.skipRule})`,
		);
	}
	const rule = report.skipRule;
	console.log(
		`  skip rule over ${rule.evaluated} of the brand's recent answers: ${rule.wouldSkip} would skip (${rule.evaluated ? Math.round((100 * rule.wouldSkip) / rule.evaluated) : 0}%)`,
	);
	console.log(`\nReport with every reply verbatim: ${file}`);
	console.log(
		`Then read it, check TypeSafe's usage for ${report.startedAt} to ${report.finishedAt}, and run:\n  pnpm perception:first-contact --report ${file} --billed-usd <amount>`,
	);
}

/** The preflight's own rules, so a run is never made against a target the preflight would refuse. */
async function assertReady(url: string) {
	const checks = checkEnvironment({
		mode: process.env.DEPLOYMENT_MODE,
		key: process.env.TYPESAFE_API_KEY,
		associationEnabled: ASSOCIATION_ENABLED,
	});
	const probe = new pg.Client({
		connectionString: url,
		application_name: "perception-first-contact",
		statement_timeout: 15_000,
	});
	await probe.connect();
	checks.push(await migrationCheck(probe).finally(() => probe.end()));
	for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"}  ${check.name}: ${check.detail}`);
	if (checks.some((check) => !check.ok))
		throw new Error("Not ready: fix the failed checks first (the preflight says the same).");
}

type Db = ReturnType<typeof createDb>;

async function printPlan(db: Db, brandId: string, limits: { prompts: number; perPrompt: number; maxCalls: number }) {
	const plan = await planFirstContact(db, { brandId, ...limits });
	console.log(`It would judge ${plan.selected.length} answers:`);
	for (const run of plan.selected) console.log(`  ${run.prompt.slice(0, 60)} (${run.model})`);
	const rule = plan.skipRule;
	console.log(
		`The skip rule over ${rule.evaluated} of the brand's recent answers: ${rule.wouldSkip} would skip without a call.`,
	);
	for (const sample of rule.samples) console.log(`    would skip: ${sample.start.replace(/\s+/g, " ").slice(0, 120)}`);
	console.log("Plan only: nothing was called or written. Add --spend to make the run.");
}

async function spendRun(db: Db, brandId: string, limits: { prompts: number; perPrompt: number; maxCalls: number }) {
	const key = process.env.TYPESAFE_API_KEY?.trim() ?? "";
	const report = await runFirstContact(db, { brandId, transport: typesafeTransport(key), ...limits });
	const file = `first-contact-${brandId}-${report.startedAt.replace(/[:.]/g, "-")}.json`;
	writeFileSync(file, JSON.stringify(report, null, 2));
	printSummary(report, file);
}

async function main() {
	const reportFile = flag("report");
	if (reportFile !== undefined) {
		const billed = Number(flag("billed-usd"));
		if (!Number.isFinite(billed) || billed < 0)
			throw new Error("Give --billed-usd with what TypeSafe charged, in dollars.");
		return priceReport(reportFile, billed);
	}
	const url = process.env.DATABASE_URL;
	const brandId = flag("brand");
	if (!url || !brandId)
		throw new Error("Usage: DATABASE_URL=... pnpm perception:first-contact --brand <brandId> [--spend]");
	await assertReady(url);
	const limits = {
		prompts: Number(flag("prompts") ?? DEFAULTS.prompts),
		perPrompt: Number(flag("per-prompt") ?? DEFAULTS.perPrompt),
		maxCalls: Math.min(Number(flag("max-calls") ?? DEFAULTS.maxCalls), MAX_FIRST_CONTACT_CALLS),
	};
	console.log(
		`Plan: brand ${brandId}, up to ${limits.prompts} fact prompts x ${limits.perPrompt} newest answers each, at most ${limits.maxCalls} calls to ${JEV_MODEL}. The brand is not switched on.`,
	);
	const db = createDb(url);
	try {
		await (has("spend") ? spendRun(db, brandId, limits) : printPlan(db, brandId, limits));
	} finally {
		await db.$client.end();
	}
}

main().catch((error) => {
	console.error(`\nFAIL  ${error instanceof Error ? error.message : error}`);
	process.exit(1);
});
