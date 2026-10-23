import type { Meta, StoryObj } from "@storybook/react";
import type { ProposedFact } from "@workspace/lib/perception/propose-facts";
import { expect, fn, userEvent, within } from "storybook/test";
import { PerceptionFactPrompts } from "@/components/perception-fact-prompts";
import { PerceptionFactSuggestions, type SuggestionsState } from "@/components/perception-fact-suggestions";

const meta = {
	title: "Components/PerceptionFactSuggestions",
} satisfies Meta;

export default meta;

const fact = (statement: string, partial: Partial<ProposedFact> = {}): ProposedFact => ({
	statement,
	category: "pricing",
	prompt: "What does Acme cost?",
	sourceUrl: "https://acme.example/pricing",
	target: "pricing",
	readAt: "2026-10-23T12:00:00.000Z",
	quote: "From $25 / month",
	topic: statement,
	notes: [],
	related: [],
	...partial,
});

const done: SuggestionsState = {
	status: "done",
	suggestions: {
		answered: true,
		coverage: [
			{ target: "pricing", url: "https://acme.example/pricing", how: "link" },
			{ target: "deployment", url: "https://acme.example/docs/self-hosting", how: "link" },
			{ target: "licence", url: null, how: null },
			{ target: "integrations", url: "https://acme.example/integrations", how: "link" },
			{ target: "security", url: "https://acme.example/security", how: "link" },
			{ target: "product", url: null, how: null },
		],
		proposals: [
			fact("HIPAA compliance is available on Acme's Team plan as a paid add-on.", {
				category: "security",
				target: "security",
				prompt: "Is Acme HIPAA compliant?",
				quote: "HIPAA is available on the Team plan as a paid add-on.",
				related: [fact("Acme is HIPAA compliant.", { target: "security", quote: "Acme is HIPAA compliant." })],
			}),
			fact("Acme can run on a laptop or a server.", {
				target: "deployment",
				prompt: "Is Acme self-hostable?",
				quote: "Run Acme on your laptop, server, or cloud.",
				notes: ['It joins claims with "and", "or" or a semicolon.'],
			}),
			fact("Acme's Pro plan starts at $25 per month."),
		],
		heldBack: [fact("Acme's Team plan starts at $599 per month.", { prompt: "What does Acme's Team plan cost?" })],
	},
};

const panel = (state: SuggestionsState, runsLeft = 2, onAccept = fn(async () => ({ promptError: null }))) => (
	<div className="max-w-2xl p-8">
		<PerceptionFactSuggestions
			state={state}
			runsLeft={runsLeft}
			website="acme.example"
			today="2026-10-23"
			factPromptRoom={2}
			onSuggest={fn(async () => {})}
			onAccept={onAccept}
		/>
	</div>
);

export const ShowsTheQualifiedFactWithItsBroaderVersion: StoryObj = {
	render: () => panel(done),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("The same page also says:")).toBeInTheDocument();
		await expect(canvas.getByText("Acme is HIPAA compliant.")).toBeInTheDocument();
		await expect(canvas.getByText(/Couldn't find a page for licence, product details/)).toBeInTheDocument();
		await expect(canvas.getByText(/This may be more than one claim/)).toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Suggest facts (about $0.10)" })).toBeEnabled();
	},
};

export const ShowsHeldBackFactsOnRequest: StoryObj = {
	render: () => panel(done),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByDisplayValue("Acme's Team plan starts at $599 per month.")).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Show 1 more" }));
		await expect(canvas.getByDisplayValue("Acme's Team plan starts at $599 per month.")).toBeInTheDocument();
	},
};

export const AcceptingKeepsTheFactAndSaysWhyItsQuestionWasnt: StoryObj = {
	render: () =>
		panel(
			done,
			2,
			fn(async () => ({ promptError: "A brand can track at most 24 perception prompts." })),
		),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [first] = canvas.getAllByRole("button", { name: "Accept" });
		await userEvent.click(first);
		await expect(
			await canvas.findByText(/Its question isn't tracked: A brand can track at most 24/),
		).toBeInTheDocument();
	},
};

export const NoRunsLeftToday: StoryObj = {
	render: () => panel({ status: "none" }, 0),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByRole("button", { name: "Suggest facts (about $0.10)" })).toBeDisabled();
		await expect(canvas.getByText("0 runs left today")).toBeInTheDocument();
	},
};

export const FactPromptsAtTheCap: StoryObj = {
	render: () => (
		<div className="max-w-2xl p-8">
			<PerceptionFactPrompts
				prompts={[
					{ id: "p1", value: "Is Acme self-hostable?", enabled: true },
					{ id: "p2", value: "What does Acme cost?", enabled: false },
				]}
				headroom={{
					perception: { used: 24, cap: 24 },
					brand: { used: 61, cap: 100 },
					factPrompts: 1,
					factPromptStart: 10,
				}}
				onAdd={fn(async () => {})}
				onStop={fn(async () => {})}
			/>
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("24 of 24")).toBeInTheDocument();
		await expect(canvas.getByText("61 of 100")).toBeInTheDocument();
		await expect(canvas.getByText(/What does Acme cost\? \(stopped\)/)).toBeInTheDocument();
		await expect(canvas.getAllByRole("button", { name: "Stop asking" })).toHaveLength(1);
		await expect(canvas.getByLabelText("New question")).toBeDisabled();
	},
};
