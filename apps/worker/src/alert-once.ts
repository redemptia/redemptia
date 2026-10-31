import * as Sentry from "@sentry/node";

const sent = new Set<string>();

/**
 * Runs `send` the first time `key` is seen on a UTC day. Ceilings are checked every cycle and every minute,
 * and an alert that repeats at that rate gets muted.
 * shortcut: remembered per process, so a restart or a second worker repeats it once; upgrade to a table if
 * that ever matters.
 */
export function alertOncePerDay(key: string, send: () => void, now = new Date()): boolean {
	const day = now.toISOString().slice(0, 10);
	const dated = `${day} ${key}`;
	if (sent.has(dated)) return false;
	for (const old of sent) if (!old.startsWith(day)) sent.delete(old);
	sent.add(dated);
	send();
	return true;
}

/** One warning per organization per UTC day for a ceiling that was reached, whichever ceiling it is. */
export function alertCeilingReached(ceiling: "provider-calls" | "jev-calls", organizationId: string, detail: string) {
	alertOncePerDay(`${ceiling} ${organizationId}`, () =>
		Sentry.withScope((scope) => {
			scope.setLevel("warning");
			scope.setTag("scheduler", `org-${ceiling}-ceiling`);
			scope.setFingerprint([`org-${ceiling}-ceiling`, organizationId]);
			Sentry.captureMessage(`Org ${organizationId} hit its daily ${ceiling} ceiling (${detail})`, "warning");
		}),
	);
}
