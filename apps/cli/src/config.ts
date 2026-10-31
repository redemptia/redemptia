import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseRenderedVersion, renderedByHeader } from "./compose-pin.js";

export type PostgresMode = "docker" | "external";

export type EnvMap = Record<string, string>;

export type DirOption = {
	dir?: string;
};

export const CONFIG_HOME = path.join(os.homedir(), ".redemptia");

export async function resolveConfigDir(explicitDir?: string): Promise<string> {
	const resolved = explicitDir ? path.resolve(process.cwd(), explicitDir) : CONFIG_HOME;
	const composePath = path.join(resolved, "redemptia.yaml");
	if (!(await fileExists(composePath))) {
		if (explicitDir) {
			throw new Error(
				`Config directory does not contain redemptia.yaml: ${resolved}\nRun \`redemptia init --dir ${explicitDir}\` to create it.`,
			);
		}
		throw new Error(`No config found at ${resolved}. Run \`redemptia init\` to create one, or specify --dir.`);
	}
	return resolved;
}

export async function writeConfigFiles(
	configDir: string,
	initConfig: {
		env: EnvMap;
		composeYaml: string;
		postgresMode: PostgresMode;
		dev: boolean;
		version: string;
	},
): Promise<void> {
	const envPath = path.join(configDir, ".env");
	const composePath = path.join(configDir, "redemptia.yaml");

	await ensureDir(configDir);
	await fs.writeFile(envPath, buildEnvFile(initConfig.env, initConfig.version), "utf8");
	await fs.writeFile(composePath, initConfig.composeYaml, "utf8");
}

const ENV_COMMENTS: Record<string, string[]> = {
	RUNS_PER_PROMPT: [
		"# Samples per prompt per platform per run; each is a provider call you pay for. 5 is the product default.",
		"# 2 is enough to damp model non-determinism at 2.5x less spend, and the 30-day window supplies the rest.",
	],
	DEFAULT_DELAY_HOURS: [
		"# Hours between runs of each prompt: 24 is one run a day. Halving it doubles provider spend.",
		"# Applies to prompts scheduled after a change; re-enable existing prompts to pick it up.",
	],
};

export function buildEnvFile(env: EnvMap, version: string): string {
	const lines = [renderedByHeader(version), "# WARNING: contains secrets. Do not commit.", ""];

	for (const [key, rawValue] of Object.entries(env)) {
		if (rawValue === undefined) {
			continue;
		}
		lines.push(...(ENV_COMMENTS[key] ?? []), `${key}=${formatEnvValue(rawValue)}`);
	}

	return `${lines.join("\n")}\n`;
}

function formatEnvValue(value: string): string {
	if (value === "") {
		return '""';
	}
	if (/[\s#"']/u.test(value)) {
		const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		return `"${escaped}"`;
	}
	return value;
}

// Reads the version recorded in a `# Rendered by redemptia <version> on ...` header.
export async function readRenderedVersion(filePath: string): Promise<string | null> {
	try {
		return parseRenderedVersion(await fs.readFile(filePath, "utf8"));
	} catch {
		return null;
	}
}

export async function fileExists(target: string): Promise<boolean> {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}

export async function ensureDir(dir: string): Promise<void> {
	await fs.mkdir(dir, { recursive: true });
}
