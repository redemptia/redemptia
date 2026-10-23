import type { Meta, StoryObj } from "@storybook/react";
import { expect, fireEvent, fn, userEvent, within } from "storybook/test";
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
	fact({
		id: "f3",
		statement: "Acme can be self-hosted.",
		judged: true,
		source: { url: "https://acme.example/docs/self-hosting", readAt: "2026-10-20T09:00:00.000Z", quote: null },
	}),
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
		await expect(canvas.getByRole("link", { name: "acme.example/docs/self-hosting" })).toHaveAttribute(
			"href",
			"https://acme.example/docs/self-hosting",
		);
		await expect(canvas.getAllByText("No source recorded").length).toBeGreaterThan(0);
		// Delete is offered only for the unjudged original, and is absent everywhere else.
		await expect(canvas.getAllByRole("button", { name: "Delete" })).toHaveLength(1);
		await userEvent.click(canvas.getByRole("button", { name: "Show 1 earlier version" }));
		await expect(canvas.getByText(/True 1 Jan 2026 to 31 Aug 2026/)).toBeInTheDocument();
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
				"This creates a new dated record. Answers from 23 Oct 2026 on are checked against the new statement. Answers before then are still checked against the current one, which stays true until 22 Oct 2026.",
			),
		).toBeInTheDocument();
		await userEvent.type(dialog.getByLabelText("New statement"), "Acme can't be self-hosted.");
		// A change on the day the current statement became true would make two versions true that day.
		fireEvent.change(dialog.getByLabelText("The change took effect on"), { target: { value: "2026-01-01" } });
		await expect(dialog.getByText(/Pick a day after 1 Jan 2026/)).toBeInTheDocument();
		await expect(dialog.getByRole("button", { name: "Record change" })).toBeDisabled();
	},
};
