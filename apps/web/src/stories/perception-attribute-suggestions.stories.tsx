import type { Meta, StoryObj } from "@storybook/react";
import type { ProposedAttribute } from "@workspace/lib/perception/propose-attributes";
import { expect, fn, userEvent, within } from "storybook/test";
import {
	type AttributeSuggestionsState,
	type ConfirmOutcome,
	PerceptionAttributeSuggestions,
} from "@/components/perception-attribute-suggestions";

const meta = {
	title: "Components/PerceptionAttributeSuggestions",
} satisfies Meta;

export default meta;

const proposal = (label: string, quality: string, quote: string | null = null): ProposedAttribute => ({
	label,
	quality,
	theme: label.toLowerCase(),
	questionText: `How does this answer characterise {subject}'s ${quality}?`,
	marketPromptText: `Which hosted databases are best on ${quality}?`,
	quote,
});

const warm: AttributeSuggestionsState = {
	status: "done",
	suggestions: {
		grounding: "warm",
		sample: { answers: 15, prompts: 5, models: 3, chars: 40_751 },
		proposals: [
			proposal("Self-hosting", "ease of self-hosting", "It's open source and self-hostable."),
			proposal("Portability", "data portability", "your data is portable by design"),
			proposal("Project uptime", "reliability of free projects that stay online", "Free projects pause."),
		],
		heldBack: [proposal("Realtime", "realtime capabilities", "Realtime functionality is convenient")],
	},
};

const panel = (
	state: AttributeSuggestionsState,
	options: { room?: number; runsLeft?: number; onConfirm?: (input: unknown) => Promise<ConfirmOutcome> } = {},
) => (
	<div className="max-w-2xl p-8">
		<PerceptionAttributeSuggestions
			state={state}
			runsLeft={options.runsLeft ?? 3}
			room={options.room ?? 10}
			associationPromptsToAdd={6}
			headroom={{ perception: { used: 10, cap: 24 }, brand: { used: 41, cap: 100 } }}
			onSuggest={fn(async () => {})}
			onConfirm={options.onConfirm ?? fn(async () => ({ associationPrompts: 6, promptError: null }))}
		/>
	</div>
);

export const ShowsWhatTheProposalWasReadFrom: StoryObj = {
	render: () => panel(warm),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(/Read from 15 answers to 5 of your prompts, across 3 models/)).toBeInTheDocument();
		await expect(canvas.getByText("“Free projects pause.”")).toBeInTheDocument();
		await expect(canvas.queryByDisplayValue("Realtime")).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Show 1 more" }));
		await expect(canvas.getByDisplayValue("Realtime")).toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Suggest attributes (about $0.05)" })).toBeEnabled();
	},
};

export const MergesTwoSuggestionsIntoOneTwoQualityAttribute: StoryObj = {
	render: () => {
		const onConfirm = fn(async () => ({ associationPrompts: 6, promptError: null }));
		return panel(warm, { onConfirm });
	},
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const [mergeFirst] = canvas.getAllByRole("button", { name: "Merge…" });
		await userEvent.click(mergeFirst);
		// Every other suggestion offers to merge; the first is Portability.
		const [withPortability] = canvas.getAllByRole("button", { name: "Merge with “Self-hosting”" });
		await userEvent.click(withPortability);
		await expect(canvas.getByDisplayValue("Self-hosting & Portability")).toBeInTheDocument();
		await expect(canvas.getByDisplayValue("ease of self-hosting and data portability")).toBeInTheDocument();
		await expect(canvas.getByText("“your data is portable by design”")).toBeInTheDocument();
		await expect(canvas.queryByText(/more than two qualities/)).not.toBeInTheDocument();

		await userEvent.click(canvas.getByRole("checkbox", { name: "Keep Self-hosting & Portability" }));
		await userEvent.click(canvas.getByRole("button", { name: "Save 1 attribute" }));
		await expect(
			await canvas.findByText(/Saved 1 attributes and started tracking 6 association prompts/),
		).toBeInTheDocument();
	},
};

export const WarnsWhenAnEditNamesAComplaintOrAThirdQuality: StoryObj = {
	render: () => panel(warm),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		const quality = canvas.getByDisplayValue("reliability of free projects that stay online");
		await userEvent.clear(quality);
		await userEvent.type(quality, "free project pausing");
		await expect(canvas.getByText(/"pausing" names a complaint/)).toBeInTheDocument();
		await userEvent.clear(quality);
		await userEvent.type(quality, "speed, uptime and support");
		await expect(canvas.getByText(/more than two qualities/)).toBeInTheDocument();
	},
};

export const StopsKeepingAtTheBrandsRoom: StoryObj = {
	render: () => panel(warm, { room: 1 }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("checkbox", { name: "Keep Self-hosting" }));
		await expect(canvas.getByRole("checkbox", { name: "Keep Portability" })).toHaveAttribute("aria-disabled", "true");
		await expect(canvas.getByText(/Keeping 1 of up to 1/)).toBeInTheDocument();
	},
};

export const SaysWhenTheListIsAGuess: StoryObj = {
	render: () =>
		panel({
			status: "done",
			suggestions: {
				...warm.suggestions,
				grounding: "seeded",
				sample: { answers: 0, prompts: 0, models: 0, chars: 0 },
			},
		} as AttributeSuggestionsState),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(/No research provider answered/)).toBeInTheDocument();
	},
};
