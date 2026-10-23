import type { Meta, StoryObj } from "@storybook/react";
import { expect, within } from "storybook/test";
import { PerceptionCostEstimateView } from "@/components/perception-cost-estimate";
import { estimatePerceptionCost } from "@/lib/perception-cost";

const meta = {
	title: "Components/PerceptionCostEstimate",
} satisfies Meta;

export default meta;

const inputs = {
	factPrompts: 10,
	targets: [
		{ model: "chatgpt", costPerRunUsd: 0.01 },
		{ model: "google-ai-mode", costPerRunUsd: 0.004 },
	],
	intervalHours: 24,
	replication: 5,
};

const view = (estimate: ReturnType<typeof estimatePerceptionCost>) => (
	<div className="max-w-xl p-8">
		<PerceptionCostEstimateView estimate={estimate} />
	</div>
);

export const SelfHostedShowsTheFigureAndItsInputs: StoryObj = {
	render: () => view(estimatePerceptionCost(inputs, true)),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		// $21 to the providers, plus $0.45–1.05 each for the mention judge and the fact checks.
		await expect(canvas.getByText(/Estimated cost per month/)).toHaveTextContent(
			"Estimated cost per month: about $22–$23",
		);
		await expect(
			canvas.getByText(/10 fact prompts, on 2 models \(chatgpt, google-ai-mode\), once a day, 5 answers/),
		).toBeInTheDocument();
		await expect(canvas.getByText(/3,000 answers a month/)).toBeInTheDocument();
		await expect(canvas.getByText(/\$21 \(\$2\.10 per fact prompt\)/)).toBeInTheDocument();
		await expect(canvas.getByText(/mention and sentiment judge also runs on these answers/)).toBeInTheDocument();
		await expect(canvas.getByText(/Not yet measured/)).toBeInTheDocument();
	},
};

export const NoDollarsForAViewerWhoDoesntPayTheBills: StoryObj = {
	render: () => view(estimatePerceptionCost(inputs, false)),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.queryByText(/\$/)).not.toBeInTheDocument();
		await expect(canvas.getByText(/3,000 answers a month/)).toBeInTheDocument();
		await expect(canvas.getByText("Costs are billed to whoever runs this deployment.")).toBeInTheDocument();
	},
};

export const OverTheDailyCap: StoryObj = {
	render: () => view(estimatePerceptionCost({ ...inputs, factPrompts: 24, intervalHours: 1 }, true)),
	play: async ({ canvasElement }) => {
		const canvas = within(canvasElement);
		await expect(canvas.getByText(/Over the cap, the rest wait for the next day/)).toBeInTheDocument();
	},
};
