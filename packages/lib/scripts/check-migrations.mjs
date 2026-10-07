// Upgrades a scratch database from the base branch's migrations to this
// branch's, then fails if any migration in this branch's journal never ran.
//
// drizzle's migrator only applies a migration whose journal `when` is newer
// than the last one the database recorded, and skips the rest without a word.
// A fresh database can't show that — it applies everything in journal order —
// so the base migrations go first, the way a deployed database would see them.
// A migration whose SQL was edited after it shipped also fails here: it never
// re-runs, so its new hash is never recorded.
//
// Usage: DATABASE_URL=... node scripts/check-migrations.mjs <base-migrations-dir> <head-migrations-dir>

import { readFileSync } from "node:fs";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const [baseFolder, headFolder] = process.argv.slice(2);
const url = process.env.DATABASE_URL;
if (!baseFolder || !headFolder || !url) {
	console.error(
		"Usage: DATABASE_URL=... node scripts/check-migrations.mjs <base-migrations-dir> <head-migrations-dir>",
	);
	process.exit(2);
}
// It migrates whatever it's pointed at, so only ever a disposable database.
if (!new URL(url).pathname.endsWith("_test")) {
	console.error("DATABASE_URL must name a scratch database ending in _test");
	process.exit(2);
}

const db = drizzle(url);
try {
	await migrate(db, { migrationsFolder: baseFolder });
	await migrate(db, { migrationsFolder: headFolder });

	const { rows } = await db.$client.query("select hash from drizzle.__drizzle_migrations");
	const applied = new Set(rows.map((row) => row.hash));
	const journal = JSON.parse(readFileSync(`${headFolder}/meta/_journal.json`, "utf8"));
	const migrations = readMigrationFiles({ migrationsFolder: headFolder });
	const missing = migrations
		.map((migration, i) => ({ ...migration, tag: journal.entries[i].tag }))
		.filter((migration) => !applied.has(migration.hash));

	if (missing.length > 0) {
		for (const { tag } of missing)
			console.error(`::error::Migration ${tag} did not apply on upgrade from the base branch.`);
		console.error(
			"Its journal `when` is older than a migration the base branch already applied, or its SQL changed after it shipped. See UPSTREAM.md.",
		);
		process.exit(1);
	}
	console.log(`All ${migrations.length} migrations applied on upgrade from the base branch.`);
} finally {
	await db.$client.end();
}
