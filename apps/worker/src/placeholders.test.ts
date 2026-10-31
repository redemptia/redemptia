import { describe, expect, it } from "vitest";
import { assertNoPlaceholders, loadedEnvFile, placeholderNames } from "./placeholders";

describe("assertNoPlaceholders", () => {
	it("stops the worker, naming each unfilled key and the file", () => {
		const env = {
			TYPESAFE_API_KEY: "PASTE_TYPESAFE_API_KEY",
			OPENAI_API_KEY: "sk-real",
			SEARCHAPI_API_KEY: "PASTE_SEARCHAPI_API_KEY",
		};
		expect(() => assertNoPlaceholders(env, "/home/me/redemptia/.env")).toThrow(
			/TYPESAFE_API_KEY, SEARCHAPI_API_KEY are still set to placeholders in \/home\/me\/redemptia\/\.env/,
		);
	});

	it("lets real keys, the stub and unset keys through", () => {
		expect(
			placeholderNames({ TYPESAFE_API_KEY: "stub", OPENAI_API_KEY: "sk-abc", SEARCHAPI_API_KEY: undefined }),
		).toEqual([]);
	});

	it("names the env file the process was started with", () => {
		expect(loadedEnvFile(["--env-file=/nonexistent/x.env"])).toBe("/nonexistent/x.env");
		expect(loadedEnvFile([])).toBe(".env");
	});
});
