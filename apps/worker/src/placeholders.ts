import { realpathSync } from "node:fs";
import { resolve } from "node:path";

/** The `PASTE_…` values the local deployment's .env ships with, where a key goes. */
const PLACEHOLDER = /^PASTE_[A-Z0-9_]+$/;

export function placeholderNames(env: NodeJS.ProcessEnv = process.env): string[] {
	return Object.entries(env)
		.filter(([, value]) => value !== undefined && PLACEHOLDER.test(value.trim()))
		.map(([name]) => name);
}

/** The .env file this process was started with, so the message can point at it. */
export function loadedEnvFile(execArgv: string[] = process.execArgv): string {
	const flag = execArgv.find((arg) => arg.startsWith("--env-file="));
	if (!flag) return ".env";
	const path = resolve(flag.slice("--env-file=".length));
	try {
		return realpathSync(path);
	} catch {
		return path;
	}
}

/** Stops the worker at boot rather than letting it call providers with a key that was never filled in. */
export function assertNoPlaceholders(env: NodeJS.ProcessEnv = process.env, file = loadedEnvFile()): void {
	const names = placeholderNames(env);
	if (names.length === 0) return;
	throw new Error(
		`${names.join(", ")} ${names.length === 1 ? "is" : "are"} still set to ${names.length === 1 ? "a placeholder" : "placeholders"} in ${file}. ` +
			"Replace with the real key and start the worker again; nothing has been called.",
	);
}
