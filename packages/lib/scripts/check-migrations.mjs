// Upgrades a scratch database from the base branch's migrations to this
// branch's, then fails if any migration in this branch's journal never ran, if
// the upgrade lost an index its own SQL doesn't drop, or if the database's
// indexes differ from the latest snapshot's plus the raw ones in index-census.mjs.
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
import { snapshotIndexNames, snapshotMismatches, unexplainedDrops } from "./index-census.mjs";

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
async function indexes() {
	const { rows } = await db.$client.query("select indexname, tablename from pg_indexes where schemaname = 'public'");
	return new Map(rows.map((row) => [row.indexname, row.tablename]));
}
try {
	await migrate(db, { migrationsFolder: baseFolder });
	const baseHashes = new Set(readMigrationFiles({ migrationsFolder: baseFolder }).map((m) => m.hash));
	const before = await indexes();
	await migrate(db, { migrationsFolder: headFolder });
	const after = await indexes();

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

	const upgradeSql = migrations.filter((m) => !baseHashes.has(m.hash)).flatMap((m) => m.sql);
	const lost = unexplainedDrops(before, after, upgradeSql);
	const latest = journal.entries.at(-1);
	const snapshotPath = `${headFolder}/meta/${String(latest.idx).padStart(4, "0")}_snapshot.json`;
	const { missing: absent, unexpected } = snapshotMismatches(
		snapshotIndexNames(JSON.parse(readFileSync(snapshotPath, "utf8"))),
		new Set(after.keys()),
	);
	for (const name of lost)
		console.error(
			`::error::Index ${name} disappeared on upgrade and no migration drops it. A dropped column takes its indexes with it.`,
		);
	for (const name of absent)
		console.error(`::error::Index ${name} is in the latest snapshot or RAW_INDEXES but not in the migrated database.`);
	for (const name of unexpected)
		console.error(
			`::error::Index ${name} is in the migrated database but in neither the latest snapshot nor RAW_INDEXES.`,
		);
	if (lost.length + absent.length + unexpected.length > 0) process.exit(1);
	console.log(`All ${after.size} indexes match the latest snapshot and RAW_INDEXES, and none was lost on upgrade.`);
} finally {
	await db.$client.end();
}
