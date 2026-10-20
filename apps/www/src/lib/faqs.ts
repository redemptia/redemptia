export interface FaqItem {
	question: string;
	answer: string;
}

// Homepage FAQ. Rendered visibly on "/" and emitted as FAQPage JSON-LD from the
// same route, so the structured data always matches what a reader (or an AI
// crawler) sees on the page.
export const HOME_FAQS: FaqItem[] = [
	{
		question: "What is Redemptia?",
		answer:
			"Redemptia is an open-source AI visibility platform for Answer Engine Optimization (AEO) — an alternative to tools like Profound, Peec, and Otterly that you can self-host for free or run on Redemptia Cloud. It tracks how AI answer engines — including ChatGPT, Google AI Overviews, Perplexity, Gemini, Claude, and Copilot — mention your brand, which competitors appear alongside you, and which sources each model cites.",
	},
	{
		question: "What is Answer Engine Optimization (AEO)?",
		answer:
			"Answer Engine Optimization (AEO) — also called Generative Engine Optimization (GEO) or LLM Optimization (LLMO) — is the practice of measuring and improving how often AI answer engines mention and cite your brand. Instead of ranking in a list of blue links, the goal is to be the source an AI quotes in its answer. (LLMO is also where Redemptia gets its name.)",
	},
	{
		question: "What is the difference between AEO, GEO, and SEO?",
		answer:
			"SEO is about ranking pages in traditional search results, while AEO and GEO are two names for the same newer discipline: getting mentioned and cited inside AI-generated answers from tools like ChatGPT, Perplexity, and Google AI Overviews. The two overlap, because AI engines run web searches and cite the pages they find, but success is measured differently — by how often and how favorably an AI names your brand, not by your position on a results page. Redemptia measures the AEO side, including the web searches AI engines fan a prompt out into and the sources they cite.",
	},
	{
		question: "Which AI models does Redemptia track?",
		answer:
			"Redemptia tracks ChatGPT, Google AI Mode, Google AI Overviews, Gemini, Perplexity, Copilot, and Claude, plus models like Grok, Mistral, DeepSeek, and Qwen. Consumer products like ChatGPT and Google AI Mode are scraped from the real interface your customers see, not approximated through an API. For each answer, Redemptia records whether your brand appears, which competitors show up alongside it, and which sources the model cites.",
	},
	{
		question: "How is AI visibility measured?",
		answer:
			"Redemptia runs a fixed set of prompts across AI engines on a schedule and scores each prompt by how often your brand appears in the answers, from 0 to 100%. It also calculates share of voice — your share of brand mentions versus your competitors — and breaks down which domains and URLs the models cite. Because AI answers vary from run to run, Redemptia samples repeatedly and reports trends, not single results.",
	},
	{
		question: "How do I track my brand in ChatGPT?",
		answer:
			"Add your website to Redemptia and its Prompt Wizard generates the questions your buyers are likely to ask ChatGPT, based on your products, competitors, and personas. Redemptia then runs those prompts in ChatGPT on a schedule and records every answer: whether your brand was mentioned, which competitors were named, and which sources were cited. Every Redemptia Cloud plan includes ChatGPT, starting with the Starter plan.",
	},
	{
		question: "How much does Redemptia cost compared to Profound?",
		answer:
			"Redemptia Cloud pricing is coming soon. The plans run from Starter and Basic up to Pro and Business, which add more brands, more prompts, and premium grounded models, and self-hosting Redemptia is free.",
	},
	{
		question: "Is Redemptia free?",
		answer:
			"Redemptia is free and open source to self-host — there is no license fee and no per-seat pricing. You only pay for your own infrastructure and any AI provider API keys you choose to use. If you'd rather not run it yourself, managed Redemptia Cloud is coming soon, and white-label plans are available for agencies.",
	},
];

// Pricing page FAQ.
export const PRICING_FAQS: FaqItem[] = [
	{
		question: "Is Redemptia free?",
		answer:
			"Yes. Redemptia is free and open source to self-host, forever. There is no license fee and no per-seat pricing — you only pay for your own infrastructure and the AI provider API keys you choose to use.",
	},
	{
		question: "Is there a hosted or cloud version of Redemptia?",
		answer:
			"Yes. Redemptia Cloud is managed hosting for teams that would rather not run their own infrastructure; pricing is coming soon. You can also self-host Redemptia for free, or get in touch about white-label deployments.",
	},
	{
		question: "Can agencies white-label Redemptia?",
		answer:
			"White-label deployments are available for agencies that want to offer AI visibility tracking under their own brand, with multi-client dashboards and custom branding. Get in touch about setting up a white-label instance for your agency.",
	},
	{
		question: "What do I need to run Redemptia myself?",
		answer:
			"Redemptia runs as a Docker Compose stack managed by a CLI. Install it, run the interactive init, and it's up in a couple of commands. You can use the bundled database or connect Redemptia to your own PostgreSQL database.",
	},
	{
		question: "Do I need a credit card to get started?",
		answer:
			"No. Self-hosting Redemptia does not require an account or a credit card. Clone the open-source repository, deploy with the CLI, and start tracking your AI visibility.",
	},
	{
		question: "Do I need to talk to sales to use Redemptia Cloud?",
		answer:
			"No. Redemptia Cloud is fully self-serve: you sign up, pick a plan, and start tracking without a demo or sales call. Every plan includes unlimited seats plus API and MCP access, and annual billing gets you two months free. Only custom contracts (higher sampling rates, custom limits, or white label) go through a conversation.",
	},
	{
		question: "How often does Redemptia run my prompts?",
		answer:
			"On Redemptia Cloud, the Starter plan runs each prompt once a day, and the Basic, Pro, and Business plans run each prompt up to 4 times a day on every platform you choose. Premium grounded models run once a day, and custom plans can sample more often. When you self-host Redemptia, you set the schedule yourself.",
	},
	{
		question: "Does Redemptia have an API or MCP server?",
		answer:
			"Yes. Redemptia has a REST API for brands, prompts, competitors, analytics, citations, runs, and reports, and an MCP server so AI assistants like Claude Code, Codex, Cursor, and VS Code can query your visibility data and manage prompts directly. Both are included on every Redemptia Cloud plan and in every self-hosted instance. API keys can be read-only or read-write and limited to specific brands.",
	},
	{
		question: "Is my data private if I self-host Redemptia?",
		answer:
			"Yes. A self-hosted Redemptia instance stores your brands, prompts, and AI responses in your own PostgreSQL database, and prompts are only sent to the scraping and AI providers you configure. Redemptia's optional telemetry sends anonymous usage counts and never includes brand names, prompt text, responses, or API keys, and you can turn it off completely with DISABLE_TELEMETRY=1.",
	},
];

// AI Visibility Tool Directory FAQ.
export const DIRECTORY_FAQS: FaqItem[] = [
	{
		question: "What is an AI visibility tool?",
		answer:
			"An AI visibility tool tracks how AI answer engines like ChatGPT, Perplexity, Gemini, and Google AI Overviews mention and cite your brand. It measures how often you appear in AI answers, which competitors show up alongside you, and which sources the models reference.",
	},
	{
		question: "What is Answer Engine Optimization (AEO)?",
		answer:
			"Answer Engine Optimization (AEO), also called generative engine optimization (GEO), is the practice of improving how often AI answer engines mention and cite your brand. AI visibility tools measure that presence so you can track and improve it over time.",
	},
	{
		question: "How do I choose the best AI visibility tool?",
		answer:
			"The right tool depends on which AI engines you need to track, whether you want self-hosting and data ownership, your budget, and any agency or white-label needs. This directory compares 100+ tools feature-by-feature. If you want every major engine, auditable metrics, and no lock-in, Redemptia is open source and free to self-host.",
	},
	{
		question: "Is there an open-source AI visibility tool?",
		answer:
			"Yes. Redemptia is an open-source, self-hostable AI visibility platform. You can run it on your own infrastructure for free, audit exactly how each metric is calculated, and export your data at any time.",
	},
	{
		question: "How does AI visibility tracking work?",
		answer:
			"AI visibility tracking works by running a defined set of prompts across AI engines on a schedule, then recording whether each answer mentions your brand, cites your site, and how it describes you. Sampling over time reveals trends a one-off check would miss.",
	},
	{
		question: "Can you track brand mentions in ChatGPT?",
		answer:
			"Yes. AI visibility software queries ChatGPT with your prompts and records whether it mentions or cites your brand. Because answers vary between runs, tracking a consistent prompt set on a schedule gives a far more reliable read than a single manual check. Redemptia does this for ChatGPT, and can capture answers from the real ChatGPT app rather than only the API.",
	},
];
