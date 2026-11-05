import { describe, expect, it } from "vitest";
import { parseRenderedVersion, refreshHeaderVersion, repinImages } from "./compose-pin.js";

const LEGACY_COMPOSE = `name: redemptia

services:
  web:
    image: redemptia/redemptia-web:latest
  worker:
    image: redemptia/redemptia-worker:latest
  db-migrate:
    image: redemptia/redemptia-db-migrate:latest
  postgres:
    image: postgres:16-alpine
`;

const HEADED_COMPOSE = `# Rendered by redemptia 0.2.10 on 2026-01-01T00:00:00.000Z
# Run \`redemptia upgrade\` after upgrading the CLI to refresh this file.
name: redemptia

services:
  web:
    image: redemptia/redemptia-web:0.2.10
  postgres:
    image: postgres:16-alpine
`;

describe("parseRenderedVersion", () => {
	it("reads the version from a rendered-by header", () => {
		expect(parseRenderedVersion(HEADED_COMPOSE)).toBe("0.2.10");
	});

	it("returns null when there is no header", () => {
		expect(parseRenderedVersion(LEGACY_COMPOSE)).toBeNull();
	});
});

describe("repinImages", () => {
	it("re-pins every redemptia/redemptia-* image to the target version", () => {
		const out = repinImages(LEGACY_COMPOSE, "0.2.13");
		expect(out).toContain("redemptia/redemptia-web:0.2.13");
		expect(out).toContain("redemptia/redemptia-worker:0.2.13");
		expect(out).toContain("redemptia/redemptia-db-migrate:0.2.13");
		expect(out).not.toContain(":latest");
	});

	it("leaves third-party images untouched", () => {
		const out = repinImages(LEGACY_COMPOSE, "0.2.13");
		expect(out).toContain("postgres:16-alpine");
	});
});

describe("refreshHeaderVersion", () => {
	it("replaces an existing header in place without duplicating it", () => {
		const out = refreshHeaderVersion(HEADED_COMPOSE, "0.2.13");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
		expect(out.match(/# Rendered by redemptia /g)).toHaveLength(1);
	});

	it("adds a header to a legacy file that has none", () => {
		expect(parseRenderedVersion(LEGACY_COMPOSE)).toBeNull();
		const out = refreshHeaderVersion(LEGACY_COMPOSE, "0.2.13");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
		expect(out).toContain("name: redemptia");
	});
});

// Without a detectable header afterwards, the next upgrade would skip the re-pin.
describe("legacy install re-pin round-trip", () => {
	it("pins images and records the version", () => {
		const out = refreshHeaderVersion(repinImages(LEGACY_COMPOSE, "0.2.13"), "0.2.13");
		expect(out).not.toContain(":latest");
		expect(out).toContain("redemptia/redemptia-web:0.2.13");
		expect(out).toContain("postgres:16-alpine");
		expect(parseRenderedVersion(out)).toBe("0.2.13");
	});
});
