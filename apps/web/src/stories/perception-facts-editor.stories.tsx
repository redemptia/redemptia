import type { Meta, StoryObj } from "@storybook/react";
import { expect, fn, userEvent, within } from "storybook/test";
import { type FactActions, type FactRow, PerceptionFactsEditor } from "@/components/perception-facts-editor";

const meta = {
	title: "Components/PerceptionFactsEditor",
} satisfies Meta;

export default meta;

const TODAY = "2026-10-23";

const fact = (partial: Partial<FactRow> & Pick<FactRow, "id" | "statement">): FactRow => ({
	category: null,
	validFrom: "2026-01-01",
	validTo: null,
	supersedes: null,
	supersededBy: null,
	judged: false,
	...partial,
});

const facts: FactRow[] = [
	fact({
		id: "f1",
		statement: "Acme's Pro plan starts at $25 per month.",
		category: "pricing",
		validTo: "2026-08-31",
		supersededBy: "f2",
		judged: true,
	}),
	fact({
		id: "f2",
		statement: "Acme's Pro plan starts at $29 per month.",
		category: "pricing",
		validFrom: "2026-09-01",
		supersedes: "f1",
		judged: true,
	}),
	fact({ id: "f3", statement: "Acme can be self-hosted.", judged: true }),
	fact({ id: "f4", statement: "Acme has a fre plan." }),
	fact({ id: "f5", statement: "Acme offers phone support.", validTo: "2026-05-31", judged: true }),
];

const actions = (): FactActions => ({
	add: fn(async () => {}),
	recordChange: fn(async () => {}),
	retire: fn(async () => {}),
	remove: fn(async () => {}),
});

export const Populated: StoryObj = {
	render: () => (
		<div className="max-w-2xl p-8">
			<PerceptionFactsEditor facts={facts} today={TODAY} actions={actions()} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("3 of 25 active")).toBeInTheDocument();
		// Delete is offered only for the unjudged original, and is absent everywhere else.
		await expect(canvas.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
		await userEvent.click(canvas.getByRole("button", { name: "Show 1 earlier version" }));
		await expect(canvas.getByText(/True 2026-01-01 to 2026-08-31/)).toBeInTheDocument();
	},
};

export const PromptsForOneClaim: StoryObj = {
	render: () => (
		<div className="max-w-2xl p-8">
			<PerceptionFactsEditor facts={[]} today={TODAY} actions={actions()} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByLabelText("New fact"), "Acme has a free plan and 500 MB of storage.");
		await expect(canvas.getByText("This looks like more than one claim.")).toBeInTheDocument();
		await expect(canvas.queryByRole("button", { name: "Add fact" })).not.toBeInTheDocument();
		await userEvent.click(canvas.getByRole("button", { name: "Keep as one fact" }));
		await expect(canvas.getByRole("button", { name: "Add fact" })).toBeEnabled();
	},
};

export const RefusesAQuestion: StoryObj = {
	render: () => (
		<div className="max-w-2xl p-8">
			<PerceptionFactsEditor facts={[]} today={TODAY} actions={actions()} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.type(canvas.getByLabelText("New fact"), "Does Acme have a free plan?");
		await expect(canvas.getByText(/assertion, not a question/)).toBeInTheDocument();
		await expect(canvas.getByRole("button", { name: "Add fact" })).toBeDisabled();
	},
};

export const RecordAChange: StoryObj = {
	render: () => (
		<div className="max-w-2xl p-8">
			<PerceptionFactsEditor facts={[facts[2]]} today={TODAY} actions={actions()} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await userEvent.click(canvas.getByRole("button", { name: "Record a change" }));
		const dialog = within(canvasElement.ownerDocument.body);
		await expect(
			dialog.getByText(
				"This creates a new dated record. Answers before 2026-10-23 are still checked against the old statement.",
			),
		).toBeInTheDocument();
	},
};
