import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import {
	type AttributeActions,
	type AttributeRow,
	PerceptionAttributesEditor,
} from "@/components/perception-attributes-editor";

const meta = {
	title: "Components/PerceptionAttributesEditor",
} satisfies Meta;

export default meta;

const row = (id: string, label: string, quality: string, partial: Partial<AttributeRow> = {}): AttributeRow => ({
	id,
	label,
	questionText: `How does this answer characterise {subject}'s ${quality}?`,
	questionVersion: 1,
	marketPromptText: `Which hosted databases are best on ${quality}?`,
	retired: false,
	...partial,
});

const ATTRIBUTES = [
	row("a1", "Self-hosting", "ease of self-hosting"),
	row("a2", "Portability", "data portability"),
	row("a3", "Pricing and value", "pricing and value for money", { questionVersion: 2 }),
	row("a4", "Mobile", "mobile SDKs", { retired: true }),
];

const actions = (): AttributeActions => ({
	add: fn(async () => {}),
	rename: fn(async () => {}),
	editQuestion: fn(async () => {}),
	setMarketPrompt: fn(async () => {}),
	retire: fn(async () => {}),
	merge: fn(async () => {}),
});

const editor = (attributes: AttributeRow[], a: AttributeActions, maxActive = 10) => (
	<div className="max-w-2xl p-8">
		<PerceptionAttributesEditor
			attributes={attributes}
			maxActive={maxActive}
			headroom={{ perception: { used: 16, cap: 24 }, brand: { used: 41, cap: 100 } }}
			actions={a}
		/>
	</div>
);

export const ShowsCountsVersionsAndRetired: StoryObj = {
	render: () => editor(ATTRIBUTES, actions()),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			canvas.getByText("3 of 10 active. Answers to your association prompts are judged on each one."),
		).toBeInTheDocument();
		await expect(canvas.getByText("Perception prompts: 16 of 24. All prompts: 41 of 100.")).toBeInTheDocument();
		await expect(canvas.getByText("question v2")).toBeInTheDocument();
		await expect(canvas.getByText(/Retired: Mobile\. Their history is kept\./)).toBeInTheDocument();
		await expect(
			canvas.getByText("How does this answer characterise your brand's ease of self-hosting?"),
		).toBeInTheDocument();
	},
};

export const RenamingSaysItIsCosmeticAndAQuestionChangeStartsANewSeries: StoryObj = {
	render: function Render() {
		return editor(ATTRIBUTES, this.args as unknown as AttributeActions);
	},
	args: actions() as unknown as Record<string, unknown>,
	play: async ({ canvasElement, args }) => {
		const a = args as unknown as AttributeActions;
		const canvas = within(canvasElement);
		const [edit] = canvas.getAllByRole("button", { name: "Edit" });
		await userEvent.click(edit);
		await expect(canvas.getByText(/Renaming changes only the name you see/)).toBeInTheDocument();
		await expect(canvas.getByText(/starts a new series/)).toBeInTheDocument();

		const name = canvas.getByLabelText("Name", { selector: "#label-a1" });
		await userEvent.clear(name);
		await userEvent.type(name, "Run it yourself");
		await userEvent.click(canvas.getByRole("button", { name: "Rename" }));
		await expect(a.rename).toHaveBeenCalledWith("a1", "Run it yourself");

		const quality = canvas.getByDisplayValue("ease of self-hosting");
		await userEvent.clear(quality);
		await userEvent.type(quality, "ease of running it on your own servers");
		await userEvent.click(canvas.getByRole("button", { name: "Save as question version 2" }));
		await expect(a.editQuestion).toHaveBeenCalledWith("a1", "ease of running it on your own servers");
	},
};

export const MergeKeepsOneAndRetiresTheOther: StoryObj = {
	render: function Render() {
		return editor(ATTRIBUTES, this.args as unknown as AttributeActions);
	},
	args: actions() as unknown as Record<string, unknown>,
	play: async ({ canvasElement, args }) => {
		const a = args as unknown as AttributeActions;
		const canvas = within(canvasElement);
		const [merge] = canvas.getAllByRole("button", { name: "Merge…" });
		await userEvent.click(merge);
		await userEvent.click(canvas.getByRole("button", { name: "Portability" }));
		await expect(canvas.getByText(/Portability is retired, and its history is kept/)).toBeInTheDocument();
		await expect(canvas.getByDisplayValue("ease of self-hosting and data portability")).toBeInTheDocument();
		await expect(canvas.queryByText(/more than two qualities/)).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Merge Portability into Self-hosting" }));
		await expect(a.merge).toHaveBeenCalledWith({
			keepId: "a1",
			retireId: "a2",
			quality: "ease of self-hosting and data portability",
			marketPromptText: "Which hosted databases are best on ease of self-hosting?",
		});
	},
};

export const RetiringAsksFirst: StoryObj = {
	render: function Render() {
		return editor(ATTRIBUTES, this.args as unknown as AttributeActions);
	},
	args: actions() as unknown as Record<string, unknown>,
	play: async ({ canvasElement, args }) => {
		const a = args as unknown as AttributeActions;
		const canvas = within(canvasElement);
		const [retire] = canvas.getAllByRole("button", { name: "Retire" });
		await userEvent.click(retire);
		await expect(a.retire).not.toHaveBeenCalled();
		await expect(canvas.getByText(/Its history is kept, and it can't be brought back/)).toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Retire Self-hosting" }));
		await expect(a.retire).toHaveBeenCalledWith("a1");
	},
};

export const AddingWarnsOnAComplaintAndStopsAtTheCap: StoryObj = {
	render: () => editor(ATTRIBUTES, actions(), 3),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(
			canvas.getByLabelText(/characterise your brand's/, { selector: "#new-attribute-quality" }),
			"project pausing",
		);
		await expect(canvas.getByText(/"pausing" names a complaint/)).toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Add attribute" })).toBeDisabled();
		await expect(canvas.getByText(/has its 3 active attributes/)).toBeInTheDocument();
	},
};
