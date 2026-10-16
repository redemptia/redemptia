import { Link } from "@tanstack/react-router";
import { openCookiePreferences } from "@workspace/ui/lib/cookie-consent";
import { cn } from "@workspace/ui/lib/utils";
import { ArrowUpRight } from "lucide-react";
import { externalRel } from "@/lib/external-link";

type FooterLink = { label: string; href: string; external?: boolean };

const cols: { heading: string; links: FooterLink[] }[] = [
	{
		heading: "Product",
		links: [
			{ label: "Features", href: "/features" },
			{ label: "Pricing", href: "/pricing" },
			{ label: "Changelog", href: "/changelog" },
			{ label: "Roadmap", href: "/roadmap" },
		],
	},
	{
		heading: "Resources",
		links: [
			{ label: "Documentation", href: "/docs" },
			{ label: "Support", href: "/support" },
			{ label: "API Reference", href: "/docs/api" },
			{ label: "Provider Status", href: "/status" },
			{ label: "Issues", href: "https://github.com/redemptia/redemptia/issues", external: true },
		],
	},
	{
		heading: "Learn",
		links: [
			{ label: "What is AEO?", href: "/answer-engine-optimization" },
			{ label: "What is GEO?", href: "/generative-engine-optimization" },
			{ label: "AEO Glossary", href: "/glossary" },
			{ label: "AI Search Guides", href: "/ai-search" },
			{ label: "AEO by Industry", href: "/aeo-for" },
		],
	},
	{
		heading: "Tools",
		links: [
			{ label: "Tool Directory", href: "/ai-visibility-tools" },
			{ label: "Free & Open-Source Tools", href: "/ai-visibility-tools/category/open-source" },
			{ label: "Compare Tools", href: "/ai-visibility-tools/compare" },
		],
	},
	{
		heading: "Company",
		links: [
			{ label: "Brand Assets", href: "/brand" },
			{ label: "llms.txt", href: "/llms.txt" },
		],
	},
];

export function Footer() {
	return (
		<footer className="relative overflow-hidden border-t border-zinc-200/80 bg-white">
			<div className="mx-auto max-w-6xl px-4 pt-16 md:px-6">
				<div className="grid grid-cols-2 gap-10 py-16 sm:grid-cols-3 lg:grid-cols-5">
					{cols.map((col) => (
						<div key={col.heading}>
							<h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">{col.heading}</h3>
							<ul className="mt-4 space-y-3 text-sm">
								{col.links.map((link) => (
									<li key={link.href}>
										<a
											href={link.href}
											target={link.external ? "_blank" : undefined}
											rel={link.external ? externalRel(link.href) : undefined}
											className="group inline-flex items-center gap-1 text-zinc-600 transition-colors hover:text-brand-600"
										>
											{link.label}
											{link.external ? (
												<ArrowUpRight
													className="size-3 opacity-50 transition group-hover:-translate-y-px group-hover:translate-x-px group-hover:opacity-100"
													aria-hidden="true"
												/>
											) : null}
										</a>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				<div className="flex flex-col gap-4 border-t border-zinc-200/80 py-6 text-xs text-zinc-500 md:flex-row md:items-center md:justify-between">
					<div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
						<p className="font-mono text-[11px]">&copy; {new Date().getFullYear()} Redemptia contributors</p>
						<nav aria-label="Legal" className="flex flex-wrap items-center gap-x-4 gap-y-2">
							<button type="button" onClick={openCookiePreferences} className="hover:text-zinc-950">
								Cookie preferences
							</button>
						</nav>
					</div>
					<div className="flex items-center gap-5">
						<a
							href="https://github.com/redemptia/redemptia"
							target="_blank"
							rel="noopener noreferrer"
							className="group inline-flex h-7 items-center gap-1.5 rounded-full bg-white pl-1 pr-2.5 text-zinc-500 shadow-sm ring-1 ring-zinc-200 transition hover:text-zinc-950 hover:ring-zinc-300"
						>
							<span className="inline-flex h-5 items-center gap-1.5 rounded-full bg-zinc-100 px-2 font-mono text-[11px] text-zinc-700">
								<span className="size-1.5 rounded-full bg-emerald-500" />v{__APP_VERSION__}
							</span>
							Open source
							<span className="sr-only"> on GitHub</span>
							<ArrowUpRight
								className="size-3 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
								aria-hidden="true"
							/>
						</a>
						<SocialLinks className="gap-4 text-zinc-400" linkClassName="transition-colors hover:text-zinc-950" />
					</div>
				</div>
			</div>
			<Link
				to="/"
				className="block select-none pb-[0.1em] text-center font-titan-one text-[clamp(4rem,18vw,12rem)] lowercase leading-[0.8] tracking-[-0.02em] text-brand-600"
			>
				redemptia
			</Link>
		</footer>
	);
}

function SocialLinks({
	className,
	linkClassName = "hover:text-zinc-900",
}: {
	className?: string;
	linkClassName?: string;
}) {
	return (
		<div className={cn("flex items-center gap-3", className)}>
			<a
				href="https://github.com/redemptia/redemptia"
				target="_blank"
				rel="noopener noreferrer"
				className={linkClassName}
			>
				<span className="sr-only">GitHub</span>
				<svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 fill-current">
					<path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
				</svg>
			</a>
		</div>
	);
}
