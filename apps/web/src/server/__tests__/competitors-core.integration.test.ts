import { isCompetitorNameTaken } from "@workspace/lib/db/unique-names";
import { afterAll, describe, expect, it } from "vitest";
import { type CompetitorInput, setBrandCompetitors } from "@/server/competitors-core";
import { createBrand, createCompetitor, deleteBrand } from "@/test/integration/stats-fixtures";

const brandIds: string[] = [];

async function brand() {
	const id = await createBrand();
	brandIds.push(id);
	return id;
}

function competitor(name: string, domain = `${name.toLowerCase()}.example`): CompetitorInput {
	return { name, domains: [domain], aliases: [] };
}

async function save(brandId: string, list: CompetitorInput[]) {
	const rows = await setBrandCompetitors(brandId, list);
	return new Map(rows.map((row) => [row.name, row]));
}

afterAll(async () => {
	for (const id of brandIds) await deleteBrand(id);
});

describe("saving a brand's competitors", () => {
	it("keeps every id when the same list is saved again", async () => {
		const brandId = await brand();
		const list = [competitor("Acme"), competitor("Globex"), competitor("Initech")];

		const first = await save(brandId, list);
		const second = await save(brandId, list);

		expect(second.size).toBe(3);
		for (const [name, row] of first) expect(second.get(name)?.id).toBe(row.id);
	});

	it("keeps the ids of untouched competitors when others are renamed, removed and added", async () => {
		const brandId = await brand();
		const before = await save(brandId, [
			competitor("Acme"),
			competitor("Globex"),
			competitor("Initech"),
			competitor("Umbrella"),
		]);

		const after = await save(brandId, [
			competitor("Acme"),
			competitor("Globex Corp", "globex.example"),
			competitor("Umbrella"),
			competitor("Hooli"),
		]);

		expect([...after.keys()].sort()).toEqual(["Acme", "Globex Corp", "Hooli", "Umbrella"]);
		expect(after.get("Acme")?.id).toBe(before.get("Acme")?.id);
		expect(after.get("Umbrella")?.id).toBe(before.get("Umbrella")?.id);
		const oldIds = new Set([...before.values()].map((row) => row.id));
		expect(oldIds.has(after.get("Globex Corp")?.id ?? "")).toBe(false);
		expect(oldIds.has(after.get("Hooli")?.id ?? "")).toBe(false);
	});

	it("updates a competitor's domains and aliases in place", async () => {
		const brandId = await brand();
		const before = await save(brandId, [competitor("Acme")]);

		const after = await save(brandId, [{ name: "Acme", domains: ["acme.example", "acme.io"], aliases: ["ACME Inc"] }]);

		expect(after.get("Acme")).toMatchObject({
			id: before.get("Acme")?.id,
			domains: ["acme.example", "acme.io"],
			aliases: ["ACME Inc"],
		});
	});

	it("refuses a list that names one competitor twice, leaving the stored list as it was", async () => {
		const brandId = await brand();
		const before = await save(brandId, [competitor("Acme")]);

		await expect(setBrandCompetitors(brandId, [competitor("Acme"), competitor("Acme", "acme.io")])).rejects.toThrow(
			'"Acme" is listed more than once.',
		);

		const after = await save(brandId, [competitor("Acme")]);
		expect(after.get("Acme")?.id).toBe(before.get("Acme")?.id);
	});

	it("reports a second competitor with a taken name as a name conflict", async () => {
		const brandId = await brand();
		await createCompetitor(brandId, "Acme", ["acme.example"]);

		const error = await createCompetitor(brandId, "Acme", ["acme.io"]).catch((err: unknown) => err);

		expect(isCompetitorNameTaken(error)).toBe(true);
	});
});
