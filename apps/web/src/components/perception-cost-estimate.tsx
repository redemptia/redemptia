import type { PerceptionCostEstimate } from "@/lib/perception-cost";

const usd = (value: number) => `$${value < 10 ? value.toFixed(2) : Math.round(value).toLocaleString("en-US")}`;
const range = ({ low, high }: { low: number; high: number }) => `${usd(low)}–${usd(high)}`;
const count = (value: number) => Math.round(value).toLocaleString("en-US");

function every(hours: number): string {
	if (hours === 24) return "once a day";
	if (hours < 24 && 24 % hours === 0) return `${24 / hours} times a day`;
	return `every ${hours} hours`;
}

/**
 * The monthly cost of perception for this brand, with every input beside it: a figure without its
 * inputs can't be checked.
 */
export function PerceptionCostEstimateView({ estimate }: { estimate: PerceptionCostEstimate }) {
	const { inputs } = estimate;
	const prompts = estimate.assumedFactPrompts ?? inputs.factPrompts;
	const overCeiling = estimate.factChecksPerDay > estimate.dailyCeiling;

	return (
		<div className="space-y-2 rounded-md bg-muted/50 p-3 text-sm">
			<p className="font-medium">
				Estimated cost per month
				{estimate.showsDollars && estimate.providerUsdPerMonth !== null && (
					<>
						: about{" "}
						{range({
							low:
								estimate.providerUsdPerMonth +
								estimate.mentionJudgeUsdPerMonth.low +
								estimate.factChecksUsdPerMonth.low,
							high:
								estimate.providerUsdPerMonth +
								estimate.mentionJudgeUsdPerMonth.high +
								estimate.factChecksUsdPerMonth.high,
						})}
					</>
				)}
			</p>
			<ul className="list-disc space-y-1 pl-5 text-muted-foreground">
				<li>
					{prompts} fact prompt{prompts === 1 ? "" : "s"}
					{estimate.assumedFactPrompts !== null && " (none yet; estimated for the number to start with)"}, on{" "}
					{inputs.targets.length} model{inputs.targets.length === 1 ? "" : "s"} (
					{inputs.targets.map((target) => target.model).join(", ") || "none enabled"}), {every(inputs.intervalHours)},{" "}
					{inputs.replication} answer{inputs.replication === 1 ? "" : "s"} each time: {count(estimate.answersPerMonth)}{" "}
					answers a month.
				</li>
				{estimate.showsDollars && (
					<li>
						AI providers:{" "}
						{estimate.providerUsdPerMonth === null || estimate.providerUsdPerPromptPerMonth === null
							? "unknown, because a provider has no per-answer estimate"
							: `${usd(estimate.providerUsdPerMonth)} (${usd(estimate.providerUsdPerPromptPerMonth)} per fact prompt), from the deployment's rough per-answer estimates`}
						.
					</li>
				)}
				{estimate.showsDollars && (
					<li>
						The mention and sentiment judge also runs on these answers, since they name your brand:{" "}
						{range(estimate.mentionJudgeUsdPerMonth)}, at the published estimate of $0.15–0.35 per 1,000 answers.
					</li>
				)}
				{estimate.showsDollars && (
					<li>
						Fact checks with Jev: {range(estimate.factChecksUsdPerMonth)}, assumed to cost the same per answer as the
						mention judge. Not yet measured.
					</li>
				)}
				<li>
					{count(estimate.factChecksPerDay)} fact checks a day, against a cap of {count(estimate.dailyCeiling)} per
					organization.
					{overCeiling && " Over the cap, the rest wait for the next day."}
				</li>
			</ul>
			{!estimate.showsDollars && (
				<p className="text-muted-foreground">Costs are billed to whoever runs this deployment.</p>
			)}
		</div>
	);
}
