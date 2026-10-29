import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { PerceptionMarket } from "@/components/perception-market";
import type { AttributeSources, MarketProminence, ProminenceCell } from "@/server/perception-prominence-core";

const meta = {
	title: "Components/PerceptionMarket",
} satisfies Meta;

export default meta;

const cell = (answers: number, mentioned: number, positions: number[], orderings = 3): ProminenceCell => ({
	answers,
	distinctModelOrderings: orderings,
	mentioned,
	positionSum: positions.reduce((a, b) => a + b, 0),
	positioned: positions.length,
	prominence: answers ? (100 * positions.reduce((sum, p) => sum + 1 / p, 0)) / answers : null,
});

const prominence: MarketProminence = {
	brand: "Acme",
	competitorSet: { fingerprint: "abc123def456", competitors: ["Globex", "Initech"] },
	otherSetAnswers: 4,
	rows: [
		{
			attributeKey: "attr_speed",
			label: "Speed",
			retired: false,
			cells: {
				Acme: cell(12, 9, [1, 1, 2, 1, 2, 1, 3, 1, 2]),
				Globex: cell(12, 10, [2, 2, 1, 2, 1, 2, 1, 2, 1, 2]),
				Initech: cell(12, 3, [3, 3, 3]),
			},
		},
		{
			attributeKey: "attr_price",
			label: "Pricing",
			retired: false,
			cells: { Acme: cell(6, 4, [1, 2, 1, 1]), Globex: cell(6, 5, [1, 1, 2, 2, 1]), Initech: cell(6, 0, []) },
		},
		{ attributeKey: "attr_old", label: "Retired one", retired: true, cells: { Acme: cell(20, 20, [1]) } },
	],
};

const sources: AttributeSources[] = [
	{
		attributeKey: "attr_speed",
		answers: 12,
		sources: [{ url: "https://example.com/fast", domain: "example.com", title: "Fastest databases", citingAnswers: 5 }],
	},
	{ attributeKey: "attr_price", answers: 6, sources: [] },
];

export const HeatmapWithItsInputsAndLimits: StoryObj = {
	render: () => (
		<div className="max-w-4xl p-8">
			<PerceptionMarket prominence={prominence} sources={sources} />
		</div>
	),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(
			canvas.getByText(/Measured against Globex, Initech \(competitor set abc123def456\)/),
		).toBeInTheDocument();
		await expect(
			canvas.getByText(/4 answers judged against an earlier competitor set aren't included/),
		).toBeInTheDocument();
		// Speed has 12 answers, so it shows; Pricing has 6, so every cell is hidden, not greyed.
		await expect(canvas.getByText("n = 12 answers · 3 orderings", { selector: "div" })).toBeInTheDocument();
		await expect(canvas.getByText("Prominence 57 · named 75% · n = 12 answers · 3 orderings")).toBeInTheDocument();
		await expect(canvas.getAllByText("—")).toHaveLength(3);
		await expect(canvas.queryByText("Retired one")).not.toBeInTheDocument();
		await expect(canvas.getByText(/No gap column/)).toBeInTheDocument();
		await expect(canvas.getByText(/#2 of 3 · n = 12 answers · 3 orderings/)).toBeInTheDocument();
		await expect(canvas.getByText(/not enough answers to rank · n = 6 answers · 3 orderings/)).toBeInTheDocument();
		// Overview cards: Speed is the only rankable attribute (12 answers > 10), and Globex beats Acme on it.
		await expect(canvas.getByText("Strongest Attribute")).toBeInTheDocument();
		await expect(canvas.getByText("Strongest Competitor")).toBeInTheDocument();
		await expect(canvas.getByText(/Leads on 1 of 1 attributes/)).toBeInTheDocument();
		await expect(canvas.getByText(/5 of 12 answers \(42%\)/)).toBeInTheDocument();
		await expect(canvas.getByText(/Not enough answers yet: sources show from 10/)).toBeInTheDocument();
	},
};
