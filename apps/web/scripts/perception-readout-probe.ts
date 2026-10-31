#!/usr/bin/env tsx
/**
 * Prints the fact readout and today's check count for one brand, as JSON, from the database in
 * DATABASE_URL. Read-only. The perception dry run (apps/worker/scripts/perception-dryrun.ts) calls it
 * so the readout is checked through the web app's own code.
 *
 *   DATABASE_URL=postgres://... pnpm exec tsx scripts/perception-readout-probe.ts <brandId>
 */
import { createDb } from "@workspace/lib/db/db";
import { getFactReadout, jevCallsToday } from "../src/server/perception-readout-core";

async function main(brandId: string | undefined, url: string | undefined) {
	if (!brandId || !url) throw new Error("Usage: DATABASE_URL=... tsx scripts/perception-readout-probe.ts <brandId>");
	const db = createDb(url);
	const readout = await getFactReadout(db, brandId, { from: null, to: null });
	const callsToday = await jevCallsToday(db, brandId);
	console.log(
		JSON.stringify({
			facts: readout.facts.map((fact) => ({ answers: fact.answers })),
			ceilingReached: readout.ceilingReached,
			callsToday,
		}),
	);
	await db.$client.end();
}

main(process.argv[2], process.env.DATABASE_URL).catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
