// Pure helpers for the Docker image tags + version header that redemptia writes into
// the generated compose / env files. Kept side-effect-free (no fs) so the
// upgrade re-pin path stays unit-testable; index.ts wraps these with file I/O.

export function renderedByHeader(version: string): string {
	return [
		`# Rendered by redemptia ${version} on ${new Date().toISOString()}`,
		"# Run `redemptia upgrade` after upgrading the CLI to refresh this file.",
	].join("\n");
}

// Reads the version recorded in a `# Rendered by redemptia <version> on ...` header,
// or null when the file has no such header (e.g. a legacy, pre-header install).
export function parseRenderedVersion(contents: string): string | null {
	const match = contents.match(/^# Rendered by redemptia (\S+) on /m);
	return match ? match[1] : null;
}

// Refreshes the `# Rendered by redemptia <version> on ...` header, adding one at the
// top if the file doesn't have it yet (e.g. a legacy install rendered before
// the header existed) so future `redemptia upgrade` runs can detect the version.
export function refreshHeaderVersion(contents: string, version: string): string {
	if (!/^# Rendered by redemptia \S+ on /m.test(contents)) {
		return `${renderedByHeader(version)}\n${contents}`;
	}
	return contents.replace(
		/^# Rendered by redemptia \S+ on .*$/m,
		`# Rendered by redemptia ${version} on ${new Date().toISOString()}`,
	);
}

// Re-pins `redemptia/redemptia-*:<tag>` image tags to `version`, leaving third-party
// images untouched. Postgres especially: a major bump needs the cluster dumped
// and restored, so rolling the tag here would break a deployment rather than
// upgrade it.
export function repinImages(contents: string, version: string): string {
	return contents.replace(/(image:\s*redemptia\/redemptia-[a-z-]+):\S+/g, `$1:${version}`);
}
