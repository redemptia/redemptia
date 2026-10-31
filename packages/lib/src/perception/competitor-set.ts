import { createHash } from "node:crypto";

/** A stable short id for a set of competitor names. */
export function competitorSetFingerprint(names: string[]): string {
	return createHash("sha256")
		.update(JSON.stringify([...names].sort()))
		.digest("hex")
		.slice(0, 12);
}
