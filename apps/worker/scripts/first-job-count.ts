import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Client } from "pg";
import type { FirstJobCount } from "../src/perception/flip-checks";

const SQL_FILE = resolve(__dirname, "../src/perception/calibration/first-job-count.sql");

/**
 * Runs first-job-count.sql itself, so the preflight and the file anyone runs by hand can't disagree.
 * It reads only; the caller holds the connection in a read-only transaction.
 */
export async function firstJobCount(client: Client, stamp: string): Promise<FirstJobCount> {
	const sql = readFileSync(SQL_FILE, "utf8").replaceAll(":stamp", client.escapeLiteral(stamp));
	const [perception, elmo] = (await client.query(sql)) as unknown as {
		rows: Record<string, string>[];
	}[];
	return {
		perception: perception.rows.map((row) => ({
			class: row.class,
			runs: Number(row.runs),
			avgRawChars: Number(row.avg_raw_chars),
		})),
		stubJudgedRuns: Number(elmo.rows[0].stub_judged_runs),
		unjudgedRuns: Number(elmo.rows[0].unjudged_runs),
	};
}
