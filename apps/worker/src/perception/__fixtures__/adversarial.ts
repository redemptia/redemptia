/**
 * Raw model output as providers actually return it, in the shapes that go wrong: an answer that doesn't
 * answer, a brand named only in a link, a competitor whose name contains the brand's, tables, other
 * languages, cut-off text and payloads that aren't the shape the extractor expects. The subject is
 * "Acme" (acme.example); its tracked competitors are "Globex" and "Acme Cloud".
 *
 * `outcome` is what the perception job must do with the run before the judge is asked anything:
 * set it aside as having no text, write "not mentioned" without a call because the answer cannot name
 * the brand, or judge it. For a judged run, `offered` says whether an evidence
 * passage may be offered for Acme, and `seen` is a snippet the judge must (or must not) be shown.
 */
export type Provider = "openai-api" | "searchapi";

export interface Fixture {
	name: string;
	provider: Provider;
	rawOutput: unknown;
	outcome: "no_text" | "judged" | "skipped";
	/** Passages naming Acme that may be offered as evidence; undefined when this fixture doesn't pin it. */
	offered?: (passages: string[]) => boolean;
	note?: string;
}

/** An OpenAI Responses API payload: one message, its text, and url_citation annotations. */
export const openai = (text: string, citations: { url: string; title?: string }[] = []) => ({
	id: "resp_1",
	object: "response",
	status: "completed",
	output: [
		{ type: "web_search_call", id: "ws_1", status: "completed" },
		{
			type: "message",
			id: "msg_1",
			role: "assistant",
			content: [
				{
					type: "output_text",
					text,
					annotations: citations.map((c, i) => ({
						type: "url_citation",
						url: c.url,
						title: c.title ?? `Source ${i + 1}`,
						start_index: 0,
						end_index: 1,
					})),
				},
			],
		},
	],
});

const none = (passages: string[]) => passages.length === 0;
const some = (passages: string[]) => passages.length > 0;
const only = (fragment: string) => (passages: string[]) =>
	passages.length > 0 && passages.every((passage) => passage.includes(fragment));
const never = (fragment: string) => (passages: string[]) => passages.every((passage) => !passage.includes(fragment));

export const ADVERSARIAL: Fixture[] = [
	{
		name: "an outright refusal",
		provider: "openai-api",
		rawOutput: openai("I'm sorry, but I can't help with that request."),
		outcome: "skipped",
		offered: none,
	},
	{
		name: "a hedged non-answer that names the brand",
		provider: "openai-api",
		rawOutput: openai(
			"I don't have reliable information about Acme's pricing, so I can't say what the Pro plan costs.",
		),
		outcome: "judged",
		offered: only("don't have reliable information"),
	},
	{
		name: "the brand named only inside a markdown link",
		provider: "openai-api",
		rawOutput: openai(
			"Pricing for this vendor is published on [the vendor's pricing page](https://acme.example/pricing). Globex is the main alternative.",
			[{ url: "https://acme.example/pricing", title: "Pricing" }],
		),
		outcome: "judged",
		offered: none,
		note: "no sentence names Acme in prose; the link target is not a mention",
	},
	{
		name: "the brand named only in a bare source line",
		provider: "openai-api",
		rawOutput: openai("The Pro plan is listed as a paid tier.\n\nSource: https://www.acme.example/pricing", [
			{ url: "https://www.acme.example/pricing" },
		]),
		outcome: "judged",
		offered: none,
	},
	{
		name: "a competitor whose name contains the brand's",
		provider: "openai-api",
		rawOutput: openai("Acme Cloud costs $50 per month on its Pro plan. Globex starts at $30."),
		outcome: "judged",
		offered: none,
		note: "Acme Cloud is a tracked competitor; the sentence is not about Acme",
	},
	{
		name: "the brand and a lookalike competitor in one answer",
		provider: "openai-api",
		rawOutput: openai("Acme starts at $25 per month. Acme Cloud costs $50 per month."),
		outcome: "judged",
		offered: only("Acme starts at $25"),
	},
	{
		name: "a markdown table instead of prose",
		provider: "openai-api",
		rawOutput: openai(
			"| Vendor | Pro plan |\n|---|---|\n| Acme | $25 per month |\n| Globex | $50 per month |\n| Initech | $40 per month |",
		),
		outcome: "judged",
		offered: only("Acme"),
		note: "a table row stays whole",
	},
	{
		name: "bulleted lists",
		provider: "openai-api",
		rawOutput: openai(
			"Options:\n\n- Acme: Pro plan from $25 per month\n- Globex: Pro plan from $50 per month\n- Initech: no free plan",
		),
		outcome: "judged",
		offered: only("Acme"),
	},
	{
		name: "text cut off mid-sentence",
		provider: "openai-api",
		rawOutput: openai(
			"Acme offers a Pro plan that starts at $25 per month and includes unlimited projects, while its Team pl",
		),
		outcome: "judged",
		offered: some,
	},
	{
		name: "a German answer",
		provider: "openai-api",
		rawOutput: openai("Acme bietet einen Pro-Tarif ab 25 $ pro Monat an. Globex ist teurer und beginnt bei 50 $."),
		outcome: "judged",
		offered: only("Acme bietet"),
	},
	{
		name: "a Japanese answer with the name run into the text",
		provider: "openai-api",
		rawOutput: openai("Acmeは月額25ドルのProプランを提供しています。Globexは月額50ドルからです。"),
		outcome: "judged",
	},
	{
		name: "mixed languages in one answer",
		provider: "openai-api",
		rawOutput: openai("Acme cuesta 25 dólares al mes. Der Preis von Globex ist höher. 价格因地区而异。"),
		outcome: "judged",
		offered: only("Acme cuesta"),
	},
	{
		name: "the brand named only to contrast it",
		provider: "openai-api",
		rawOutput: openai("Unlike Acme, which doesn't offer a free plan, Globex lets you start for free."),
		outcome: "judged",
		offered: only("Unlike Acme"),
	},
	{
		name: "the brand in a counterfactual",
		provider: "openai-api",
		rawOutput: openai("If Acme charged $10 per month it would undercut every rival, but it doesn't."),
		outcome: "judged",
		offered: some,
	},
	{
		name: "an empty answer",
		provider: "openai-api",
		rawOutput: openai(""),
		outcome: "no_text",
	},
	{
		name: "a whitespace-only answer",
		provider: "openai-api",
		rawOutput: openai("   \n\t  \n"),
		outcome: "no_text",
	},
	{
		name: "inline image data inside the answer",
		provider: "openai-api",
		rawOutput: openai(`Acme starts at $25 per month. ![logo](data:image/png;base64,${"iVBORw0KGgo".repeat(400)})`),
		outcome: "judged",
		offered: only("Acme starts at $25"),
	},
	{
		name: "citation markers and HTML in the text",
		provider: "openai-api",
		rawOutput: openai("<p>Acme starts at <b>$25</b> per month.[1][2]</p><p>Globex starts at $50.[3]</p>"),
		outcome: "judged",
		offered: some,
	},
	{
		name: "annotations that are not an array",
		provider: "openai-api",
		rawOutput: {
			output: [
				{
					type: "message",
					content: [{ type: "output_text", text: "Acme starts at $25 per month.", annotations: "none" }],
				},
			],
		},
		outcome: "judged",
		offered: some,
		note: "the text is fine; the broken citations are not needed to judge it",
	},
	{
		name: "a SearchApi answer built from text blocks",
		provider: "searchapi",
		rawOutput: {
			ai_overview: {
				text_blocks: [
					{ type: "paragraph", answer: "Acme's Pro plan starts at $25 per month." },
					{ type: "unordered_list", items: [{ type: "paragraph", answer: "Globex starts at $50 per month." }] },
				],
			},
		},
		outcome: "judged",
		offered: some,
	},
	{
		name: "a SearchApi payload with no answer",
		provider: "searchapi",
		rawOutput: { search_metadata: { status: "Success" }, organic_results: [] },
		outcome: "no_text",
	},
	{
		name: "an answer about competitors only",
		provider: "openai-api",
		rawOutput: openai("Globex starts at $30 per month. Initech is $40 per month, and Hooli has no free plan."),
		outcome: "skipped",
	},
	{
		name: "a generic non-answer",
		provider: "openai-api",
		rawOutput: openai(
			"Pricing varies by region and changes often, so the best thing to do is check the official website.",
		),
		outcome: "skipped",
	},
	{
		name: "the brand misspelled",
		provider: "openai-api",
		rawOutput: openai("Acmee offers a Pro plan at $25 per month for teams."),
		outcome: "judged",
	},
	{
		name: "the brand hyphenated and in a possessive",
		provider: "openai-api",
		rawOutput: openai("The Ac-me plan is clear, and Acme's Pro tier is $25 per month for teams."),
		outcome: "judged",
	},
	{
		name: "the brand in capitals",
		provider: "openai-api",
		rawOutput: openai("ACME PRO COSTS $25 PER MONTH ACCORDING TO THE VENDOR."),
		outcome: "judged",
	},
	{
		name: "the brand only implied",
		provider: "openai-api",
		rawOutput: openai("It starts at $25 per month on the Pro plan."),
		outcome: "judged",
	},
	{
		name: "the brand only in the citations",
		provider: "openai-api",
		rawOutput: openai(
			"Pricing varies by region and changes often, so the best thing to do is check the official website.",
			[{ url: "https://www.acme.example/pricing", title: "Pricing" }],
		),
		outcome: "judged",
		note: "nothing in the text, but the answer cited the brand's own pricing page",
	},
];

/** Payloads that are not the shape the extractor expects: all of them must be set aside, none may throw. */
export const MALFORMED: { name: string; provider: Provider; rawOutput: unknown }[] = [
	{ name: "null", provider: "openai-api", rawOutput: null },
	{ name: "an empty object", provider: "openai-api", rawOutput: {} },
	{ name: "an array", provider: "openai-api", rawOutput: [] },
	{ name: "a number", provider: "openai-api", rawOutput: 42 },
	{ name: "a bare string", provider: "openai-api", rawOutput: "Acme starts at $25." },
	{ name: "output as a string", provider: "openai-api", rawOutput: { output: "Acme starts at $25." } },
	{ name: "output holding nulls", provider: "openai-api", rawOutput: { output: [null, 7, "x"] } },
	{
		name: "a message with null content",
		provider: "openai-api",
		rawOutput: { output: [{ type: "message", content: null }] },
	},
	{
		name: "content that is not an array",
		provider: "openai-api",
		rawOutput: { output: [{ type: "message", content: "text" }] },
	},
	{
		name: "text that is not a string",
		provider: "openai-api",
		rawOutput: { output: [{ type: "message", content: [{ type: "output_text", text: { a: 1 } }] }] },
	},
	{ name: "empty choices", provider: "openai-api", rawOutput: { choices: [] } },
	{ name: "a choice with a null message", provider: "openai-api", rawOutput: { choices: [{ message: null }] } },
	{
		name: "an error payload",
		provider: "openai-api",
		rawOutput: { error: { message: "rate limited", type: "rate_limit" } },
	},
	{ name: "a SearchApi payload that is a string", provider: "searchapi", rawOutput: "oops" },
	{
		name: "a SearchApi answer of the wrong type",
		provider: "searchapi",
		rawOutput: { ai_overview: { text_blocks: "no" } },
	},
];
