import { db } from "@workspace/lib/db/db";
import { lockBrandAnalysis } from "@workspace/lib/enrichment/write";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Stand in for another writer of a brand's analysis: take the brand's lock, then
 * hold it, uncommitted, until released, and run `work` just before committing.
 */
export function holdBrandLock(brandId: string, work: (tx: Tx) => Promise<unknown>) {
	let markLocked!: () => void;
	let release!: () => void;
	const locked = new Promise<void>((resolve) => {
		markLocked = resolve;
	});
	const released = new Promise<void>((resolve) => {
		release = resolve;
	});
	const done = db.transaction(async (tx) => {
		await lockBrandAnalysis(tx, brandId);
		markLocked();
		await released;
		await work(tx);
	});
	return { locked, release, done };
}
