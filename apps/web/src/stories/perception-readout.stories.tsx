import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { PerceptionReadout } from "@/components/perception-readout";
import type { FactReadout } from "@/server/perception-readout-core";

const meta = {
	title: "Components/PerceptionReadout",
} satisfies Meta;

export default meta;

const readout: FactReadout = {
	facts: [
		{
			factId: "f1",
			statement: "Acme Pro starts at $29 per month.",
			validFrom: "2026-01-01",
			validTo: null,
			sourceUrl: "https://acme.example/pricing",
			answers: 248,
			stated: 47,
			unclear: 15,
			absent: 184,
			contradicted: 2,
			grounding: { cited: 200, citedSource: 30, citedSite: 61 },
		},
		{
			factId: "f2",
			statement: "Acme can be self-hosted.",
			validFrom: "2026-01-01",
			validTo: null,
			sourceUrl: null,
			answers: 7,
			stated: 1,
			unclear: 0,
			absent: 6,
			contradicted: 0,
			grounding: { cited: 5, citedSource: 0, citedSite: 1 },
		},
	],
	alertCount: 2,
	alerts: [
		{
			verdictId: "v1",
			factId: "f1",
			statement: "Acme Pro starts at $29 per month.",
			sourceUrl: "https://acme.example/pricing",
			sourceReadAt: "2026-10-01T00:00:00.000Z",
			passage: "Pricing begins around $49 a month for the Pro plan.",
			model: "chatgpt",
			answeredAt: "2026-10-18T09:00:00.000Z",
			promptId: "p1",
			prompt: "What does Acme cost?",
			confidence: 0.92,
			cited: false,
			citedSource: false,
			citedSite: false,
		},
		{
			verdictId: "v2",
			factId: "f1",
			statement: "Acme Pro starts at $29 per month.",
			sourceUrl: "https://acme.example/pricing",
			sourceReadAt: "2026-10-01T00:00:00.000Z",
			passage: null,
			model: "claude",
			answeredAt: "2026-10-12T09:00:00.000Z",
			promptId: "p1",
			prompt: "What does Acme cost?",
			confidence: 0.6,
			cited: true,
			citedSource: false,
			citedSite: true,
		},
	],
};

const view = (data: FactReadout) => (
	<div className="max-w-3xl p-8">
		<PerceptionReadout readout={data} org="default" brand="acme" />
	</div>
);

export const CoverageLeadsAndContradictionsAlert: StoryObj = {
	render: () => view(readout),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("Stated in 19%")).toBeInTheDocument();
		await expect(canvas.getByText(/not mentioned in 74% of 248 answers to fact prompts/)).toBeInTheDocument();
		// A contradiction is a count pointing at its alerts, never a percentage.
		await expect(canvas.getByText(/2 contradictions, listed below/)).toBeInTheDocument();
		await expect(canvas.queryByText(/contradict\w* in \d+%/)).not.toBeInTheDocument();
		await expect(
			canvas.getByText(/81% cite any source, 25% cite your site, and 12% cite this fact's source page/),
		).toBeInTheDocument();
		await expect(canvas.getByText('"Pricing begins around $49 a month for the Pro plan."')).toBeInTheDocument();
		await expect(canvas.getByText(/this answer cited no sources/)).toBeInTheDocument();
		await expect(canvas.getByText(/no single passage; see the answer/)).toBeInTheDocument();
	},
};

export const HidesFiguresBelowTenAnswers: StoryObj = {
	render: () => view(readout),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			canvas.getByText(/Not enough data yet: 7 answers so far, and figures show from 10/),
		).toBeInTheDocument();
		await expect(canvas.queryByText("Stated in 14%")).not.toBeInTheDocument();
	},
};

export const NothingContradicts: StoryObj = {
	render: () => view({ ...readout, alerts: [], alertCount: 0 }),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText("No answer contradicts your facts for these filters.")).toBeInTheDocument();
	},
};
