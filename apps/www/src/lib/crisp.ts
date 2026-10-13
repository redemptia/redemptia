// The site operator's own Crisp inbox, set at build time; with none, no chat loads.
const CRISP_WEBSITE_ID: string | undefined = import.meta.env.VITE_CRISP_WEBSITE_ID || undefined;
import { afterPageIdle } from "./idle";

type CrispCommand = unknown[];

declare global {
	interface Window {
		$crisp?: CrispCommand[];
		CRISP_WEBSITE_ID?: string;
	}
}

const CRISP_SCRIPT_URL = "https://client.crisp.chat/l.js";

let initialized = false;

export function initCrisp(): void {
	if (initialized || typeof window === "undefined" || !CRISP_WEBSITE_ID) return;
	initialized = true;

	window.$crisp = [];
	window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;
	// So a marketing-site question is distinguishable from one raised in the product.
	window.$crisp.push(["set", "session:segments", [["marketing"]]]);

	void afterPageIdle().then(() => {
		const script = document.createElement("script");
		script.src = CRISP_SCRIPT_URL;
		script.async = true;
		document.head.appendChild(script);
	});
}

/** Crisp can take seconds to load, so `onOpened` reports when the chat is actually on screen. */
export function openCrispChat(onOpened: () => void): void {
	initCrisp();
	window.$crisp?.push([
		"on",
		"chat:opened",
		() => {
			window.$crisp?.push(["off", "chat:opened"]);
			onOpened();
		},
	]);
	window.$crisp?.push(["do", "chat:open"]);
}
