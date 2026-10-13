import { createFileRoute } from "@tanstack/react-router";
import { CLOUD_ENTRY_PRICE_USD } from "@workspace/config/plans";
import { SITE_URL } from "@/lib/seo";

// Curated llms.txt for the marketing site, following the llmstxt.org convention:
// an H1, a one-paragraph summary, a short positioning blurb, then sections of
// annotated links. The full text of the documentation lives at /llms-full.txt.
const llmsTxt = `# Elmo

> Elmo is an open source, self-hosted AI visibility platform. Track how AI answer engines like ChatGPT, Google AI Overviews, Perplexity, Gemini, Copilot, and Grok talk about your brand — monitor mentions, analyze citations, and benchmark competitors. Because Elmo is open source and runs on your own infrastructure, your data stays yours and you're never locked in.

Elmo is Answer Engine Optimization (AEO), also called generative engine optimization (GEO), without the black box. On a schedule, it runs your prompts across every major AI answer engine, then measures how often your brand appears, which competitors show up alongside it, and which sources the models cite. The methodology is documented and every line of code is open, so each number is something you can independently verify. Self-host it for free, or run it as managed cloud hosting from $${CLOUD_ENTRY_PRICE_USD}/month or as a white-label deployment.

## Product

- [Elmo](${SITE_URL}/): Know how AI talks about your brand — track visibility across any AI model, monitor mentions, analyze citations, and benchmark competitors.
- [Features](${SITE_URL}/features): Visibility dashboard, per-prompt and per-model tracking, citation analysis, competitor intelligence, prompt management, response deep-dives, and long-term trends.
- [Pricing](${SITE_URL}/pricing): Free and open source to self-host, managed cloud from $${CLOUD_ENTRY_PRICE_USD}/month, and white-label available for agencies.

## Documentation

- [Documentation](${SITE_URL}/docs.md): Introduction to Elmo, the open source AI visibility platform.
- [Quick Start](${SITE_URL}/docs/getting-started.md): Get Elmo running on your own infrastructure in under 5 minutes using the CLI.
- [User Guide](${SITE_URL}/docs/user-guide.md): A complete walkthrough, from first login to daily visibility tracking, prompts, citations, competitors, and reports.
- [Developer Guide](${SITE_URL}/docs/developer-guide.md): Run, configure, integrate with, and contribute to Elmo, including architecture and self-hosting setup.
- [API Reference](${SITE_URL}/docs/api.md): Complete REST API documentation for Elmo's administrative API.
- [MCP Server](${SITE_URL}/docs/api/mcp.md): Connect Claude Code, OpenCode, or another AI client to Elmo over the Model Context Protocol.
- [llms-full.txt](${SITE_URL}/llms-full.txt): The full text of all Elmo documentation in a single file.

## Resources

- [AI Visibility Tool Directory](${SITE_URL}/ai-visibility-tools): Compare 100+ AI visibility and Answer Engine Optimization tools, with a feature matrix, pricing, and head-to-head comparisons with Elmo.
- [Changelog](${SITE_URL}/changelog): Recent releases, improvements, and bug fixes.
- [Roadmap](${SITE_URL}/roadmap): What's coming next, prioritized in the open on GitHub.
- [Provider Status](${SITE_URL}/status): Real-time status and performance monitoring for AI answer engine integrations.
- [Brand Assets](${SITE_URL}/brand): Download Elmo logos, icons, and brand guidelines.

## Open Source

- [GitHub Repository](https://github.com/elmohq/elmo): Source code for Elmo — self-host it, read every line, and contribute.
- [Issues](https://github.com/elmohq/elmo/issues): Report bugs, request features, and help shape the roadmap.

---

If you find Elmo useful, please consider starring the repository on GitHub — it helps others discover the project: https://github.com/elmohq/elmo
`;

export const Route = createFileRoute("/llms.txt")({
	server: {
		handlers: {
			GET() {
				return new Response(llmsTxt, {
					headers: { "Content-Type": "text/plain; charset=utf-8" },
				});
			},
		},
	},
});
