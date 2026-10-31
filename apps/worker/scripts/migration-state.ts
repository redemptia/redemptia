import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";
import type { Client } from "pg";
import { type Check, checkMigrations } from "../src/perception/flip-checks";

const MIGRATIONS = resolve(__dirname, "../../../packages/lib/src/db/migrations");

/** Whether every migration in the journal is recorded as applied on the connected database. Reads only. */
export async function migrationCheck(client: Client): Promise<Check> {
	const journal = JSON.parse(readFileSync(`${MIGRATIONS}/meta/_journal.json`, "utf8"));
	const files = readMigrationFiles({ migrationsFolder: MIGRATIONS }).map((migration, i) => ({
		tag: journal.entries[i].tag as string,
		hash: migration.hash,
	}));
	const table = await client.query("select to_regclass('drizzle.__drizzle_migrations') as t");
	const applied = new Set<string>(
		table.rows[0].t
			? (await client.query("select hash from drizzle.__drizzle_migrations")).rows.map((row) => row.hash)
			: [],
	);
	return checkMigrations(files, applied);
}
