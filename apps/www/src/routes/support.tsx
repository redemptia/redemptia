import { createFileRoute } from "@tanstack/react-router";
import { buttonVariants } from "@workspace/ui/components/button";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { externalRel } from "@/lib/external-link";
import { breadcrumbJsonLd, canonicalUrl, ogMeta } from "@/lib/seo";

const title = "Support · Elmo";
const description = "Get help with Elmo: report bugs and request features on GitHub, or report a vulnerability privately.";

const GITHUB_ISSUES_URL = "https://github.com/elmohq/elmo/issues";
const SECURITY_REPORT_URL = "https://github.com/elmohq/elmo/security/advisories/new";

export const Route = createFileRoute("/support")({
	head: () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			...ogMeta({ title, description, path: "/support" }),
		],
		links: [{ rel: "canonical", href: canonicalUrl("/support") }],
		scripts: [
			breadcrumbJsonLd([
				{ name: "Home", path: "/" },
				{ name: "Support", path: "/support" },
			]),
		],
	}),
	component: SupportPage,
});

function ContactCard({ heading, body, action }: { heading: string; body: string; action: ReactNode }) {
	return (
		<div className="flex flex-col rounded-md border border-zinc-200 bg-white p-6">
			<h2 className="text-lg font-semibold text-zinc-950">{heading}</h2>
			<p className="mt-2 flex-1 text-sm text-zinc-600">{body}</p>
			<div className="mt-5">{action}</div>
		</div>
	);
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
	return (
		<a
			href={href}
			target="_blank"
			rel={externalRel(href)}
			className={buttonVariants({ variant: "outline", size: "sm" })}
		>
			{children}
			<ArrowUpRight className="size-3.5" />
		</a>
	);
}

function ResourceLink({ href, label, detail }: { href: string; label: string; detail: string }) {
	const external = href.startsWith("http");
	return (
		<a
			href={href}
			{...(external ? { target: "_blank", rel: externalRel(href) } : {})}
			className="group flex items-start justify-between gap-4 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:bg-zinc-50"
		>
			<div>
				<p className="text-sm font-medium text-zinc-950 group-hover:text-blue-600">{label}</p>
				<p className="mt-1 text-xs text-zinc-500">{detail}</p>
			</div>
			{external && <ArrowUpRight className="size-4 shrink-0 text-zinc-400" />}
		</a>
	);
}

function SupportPage() {
	return (
		<div className="min-h-screen">
			<Navbar />
			<main className="mx-auto max-w-6xl px-4 py-12 md:px-6 lg:py-20">
				<header className="mb-16 space-y-4">
					<p className="font-mono text-[11px] uppercase tracking-[0.18em] text-zinc-500">/ SUPPORT</p>
					<h1 className="font-heading text-4xl text-zinc-950 lg:text-5xl">Support</h1>
					<p className="max-w-2xl text-lg text-balance text-zinc-600">
						Questions about your account, billing, the MCP server, or self-hosting Elmo? Here is how to reach us.
					</p>
				</header>

				<section className="mb-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					<ContactCard
						heading="Bugs and feature requests"
						body="Elmo is open source. Report bugs and request features on GitHub, where you can follow the fix."
						action={<ExternalButton href={GITHUB_ISSUES_URL}>Open an issue</ExternalButton>}
					/>
					<ContactCard
						heading="Security"
						body="Report vulnerabilities privately through GitHub rather than in a public issue."
						action={<ExternalButton href={SECURITY_REPORT_URL}>Report privately</ExternalButton>}
					/>
				</section>

				<section>
					<h2 className="mb-6 text-xl font-semibold text-zinc-950">Before you write</h2>
					<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<ResourceLink href="/docs" label="Documentation" detail="Setup, features, and self-hosting guides." />
						<ResourceLink
							href="/docs/api/mcp"
							label="MCP server"
							detail="Connecting Elmo to ChatGPT, Claude, Cursor, and other clients."
						/>
						<ResourceLink href="/status" label="Provider status" detail="How each AI provider integration is doing." />
					</div>
				</section>
			</main>
			<Footer />
		</div>
	);
}
