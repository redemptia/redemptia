import { randomUUID } from "node:crypto";
import { db } from "@workspace/lib/db/db";
import { brands, organization } from "@workspace/lib/db/schema";
import { mentionJudgeCalls } from "@workspace/lib/db/schema-perception";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { reserveMentionCall } from "./mention-budget";

const ids: string[] = [];

async function brand() {
	const id = `brand-${randomUUID()}`;
	ids.push(id);
	await db.insert(organization).values({ id, name: id, slug: id, createdAt: new Date() });
	await db
		.insert(brands)
		.values({ id, organizationId: id, name: "Acme", website: "https://acme.example", onboarded: true });
	return id;
}

beforeEach(() => {
	ids.length = 0;
});

afterEach(async () => {
	for (const id of ids) {
		await db.delete(mentionJudgeCalls).where(eq(mentionJudgeCalls.organizationId, id));
		await db.delete(brands).where(eq(brands.id, id));
		await db.delete(organization).where(eq(organization.id, id));
	}
});

describe("reserving a slot for the mention judge", () => {
	it("grants exactly the ceiling's worth to workers asking at once", async () => {
		const id = await brand();
		const grants = await Promise.all(Array.from({ length: 10 }, () => reserveMentionCall(db, id, 3)));
		expect(grants.filter(Boolean)).toHaveLength(3);
	});

	it("counts each organization on its own", async () => {
		const [a, b] = [await brand(), await brand()];
		expect(await reserveMentionCall(db, a, 1)).toBe(true);
		expect(await reserveMentionCall(db, a, 1)).toBe(false);
		expect(await reserveMentionCall(db, b, 1)).toBe(true);
	});

	it("gives a brand that doesn't exist no slot", async () => {
		expect(await reserveMentionCall(db, "no-such-brand", 10)).toBe(false);
	});
});
