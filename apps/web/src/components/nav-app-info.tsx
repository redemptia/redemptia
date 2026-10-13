import { IconBrandGithub, IconCookie } from "@tabler/icons-react";
import { useRouteContext } from "@tanstack/react-router";
import type { ClientConfig } from "@workspace/config/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip";
import { openCookiePreferences } from "@workspace/ui/lib/cookie-consent";

export function NavAppInfo() {
	const context = useRouteContext({ strict: false }) as { clientConfig?: ClientConfig };
	const mode = context.clientConfig?.mode;

	// Whitelabel deployments hide the version and GitHub links.
	if (mode === "whitelabel") return null;

	const linkClass =
		"text-muted-foreground hover:text-foreground inline-flex size-7 items-center justify-center rounded-md transition-colors";

	return (
		<div className="mx-2 mt-1 flex items-center gap-2 border-t border-sidebar-border/60 px-1 pt-2">
			<a
				href={`https://github.com/elmohq/elmo/releases/tag/v${__APP_VERSION__}`}
				target="_blank"
				rel="noreferrer"
				className="flex-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
			>
				v{__APP_VERSION__}
			</a>
			<div className="flex items-center gap-1">
				{/* Only cloud gates anything on consent, so only cloud has a choice to revisit. */}
				{mode === "cloud" && (
					<Tooltip>
						<TooltipTrigger
							render={<button type="button" onClick={openCookiePreferences} className={linkClass} aria-label="Cookie preferences" />}
						>
							<IconCookie className="size-4" />
						</TooltipTrigger>
						<TooltipContent>Cookie preferences</TooltipContent>
					</Tooltip>
				)}
				<Tooltip>
					<TooltipTrigger
						render={<a href="https://github.com/elmohq/elmo" target="_blank" rel="noreferrer" className={linkClass} />}
					>
						<IconBrandGithub className="size-4" />
					</TooltipTrigger>
					<TooltipContent>View on GitHub</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
