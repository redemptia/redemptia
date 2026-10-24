import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { useState } from "react";
import { PerceptionAttributeSuggestions } from "@/components/perception-attribute-suggestions";
import { PerceptionAttributes } from "@/components/perception-attributes";
import { PerceptionCostEstimateView } from "@/components/perception-cost-estimate";
import { PerceptionFactPrompts } from "@/components/perception-fact-prompts";
import { PerceptionFactSuggestions } from "@/components/perception-fact-suggestions";
import { type FactActions, PerceptionFactsEditor } from "@/components/perception-facts-editor";
import { useBrandId } from "@/hooks/use-brand-id";
import { useBrand } from "@/hooks/use-brands";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	confirmAttributesFn,
	getAttributeSuggestionsFn,
	getAttributesFn,
	suggestAttributesFn,
} from "@/server/perception-attributes";
import {
	acceptFactSuggestionFn,
	addFactFn,
	addFactPromptFn,
	deleteFactFn,
	getFactPromptsFn,
	getFactSuggestionsFn,
	getPerceptionCostFn,
	getPerceptionSettingsFn,
	recordFactChangeFn,
	retireFactFn,
	setPerceptionEnabledFn,
	stopTrackingFactPromptFn,
	suggestFactsFn,
} from "@/server/perception-facts";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/perception")({
	staticData: { crumb: "Perception" },
	head: pageHead({ description: "Record your brand's facts and turn perception on." }),
	component: PerceptionSettingsPage,
});

const settingsKey = (brandId: string) => ["perception-settings", brandId] as const;
const promptsKey = (brandId: string) => ["perception-fact-prompts", brandId] as const;
const costKey = (brandId: string) => ["perception-cost", brandId] as const;
const suggestionsKey = (brandId: string) => ["perception-fact-suggestions", brandId] as const;
const attributesKey = (brandId: string) => ["perception-attributes", brandId] as const;
const attributeSuggestionsKey = (brandId: string) => ["perception-attribute-suggestions", brandId] as const;
const SUGGESTIONS_POLL_MS = 3000;

function PerceptionSettingsPage() {
	const brandId = useBrandId();
	const queryClient = useQueryClient();
	const writeError = useWriteErrorMessage();
	const [switchError, setSwitchError] = useState<string | null>(null);
	const { data, isLoading } = useQuery({
		queryKey: settingsKey(brandId),
		queryFn: () => getPerceptionSettingsFn({ data: { brandId } }),
	});
	const { data: brand } = useBrand(brandId);
	const { data: promptState } = useQuery({
		queryKey: promptsKey(brandId),
		queryFn: () => getFactPromptsFn({ data: { brandId } }),
	});
	const { data: cost } = useQuery({
		queryKey: costKey(brandId),
		queryFn: () => getPerceptionCostFn({ data: { brandId } }),
	});
	const { data: suggestions } = useQuery({
		queryKey: suggestionsKey(brandId),
		queryFn: () => getFactSuggestionsFn({ data: { brandId } }),
		refetchInterval: (query) => (query.state.data?.status === "pending" ? SUGGESTIONS_POLL_MS : false),
	});
	const { data: attributeState } = useQuery({
		queryKey: attributesKey(brandId),
		queryFn: () => getAttributesFn({ data: { brandId } }),
	});
	const { data: attributeSuggestions } = useQuery({
		queryKey: attributeSuggestionsKey(brandId),
		queryFn: () => getAttributeSuggestionsFn({ data: { brandId } }),
		refetchInterval: (query) => (query.state.data?.status === "pending" ? SUGGESTIONS_POLL_MS : false),
	});
	const refresh = () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: attributesKey(brandId) }),
			queryClient.invalidateQueries({ queryKey: settingsKey(brandId) }),
			queryClient.invalidateQueries({ queryKey: promptsKey(brandId) }),
			queryClient.invalidateQueries({ queryKey: costKey(brandId) }),
		]);
	const today = new Date().toISOString().slice(0, 10);

	// Each write rethrows a readable message for the editor to show next to what failed.
	const write = async (run: () => Promise<unknown>, fallback: string) => {
		try {
			await run();
		} catch (error) {
			throw new Error(writeError(error, fallback));
		}
		await refresh();
	};
	const actions: FactActions = {
		add: (input) => write(() => addFactFn({ data: { brandId, ...input } }), "Couldn't add the fact."),
		recordChange: (factId, input) =>
			write(() => recordFactChangeFn({ data: { brandId, factId, ...input } }), "Couldn't record the change."),
		retire: (factId, noLongerTrueFrom) =>
			write(() => retireFactFn({ data: { brandId, factId, noLongerTrueFrom } }), "Couldn't retire the fact."),
		remove: (factId) => write(() => deleteFactFn({ data: { brandId, factId } }), "Couldn't delete the fact."),
	};

	if (isLoading || !data) {
		return (
			<div className="space-y-6">
				<h1 className="text-3xl font-bold">Perception</h1>
				<p className="text-muted-foreground">Loading...</p>
			</div>
		);
	}

	return (
		<div className="max-w-2xl space-y-8">
			<div>
				<h1 className="text-3xl font-bold">Perception</h1>
				<p className="text-muted-foreground">Check what AI answers say against the facts you record.</p>
			</div>

			<div className="flex items-start justify-between gap-4 rounded-lg border p-4">
				<div className="space-y-1">
					<Label htmlFor="perception-enabled">Check answers against your facts</Label>
					<p className="text-sm text-muted-foreground">
						When on, answers to your fact prompts are judged against these facts with Jev, a paid service, at up to
						2,000 checks per organization per day. When off, nothing is judged or billed.
					</p>
					{cost && <PerceptionCostEstimateView estimate={cost} />}
					{switchError && <p className="text-sm text-destructive">{switchError}</p>}
				</div>
				<Switch
					id="perception-enabled"
					checked={data.enabled}
					onCheckedChange={async (enabled) => {
						setSwitchError(null);
						try {
							await setPerceptionEnabledFn({ data: { brandId, enabled } });
							await refresh();
						} catch (error) {
							setSwitchError(writeError(error, "Couldn't change the setting."));
						}
					}}
				/>
			</div>

			<PerceptionFactsEditor facts={data.facts} today={today} actions={actions} />

			{promptState && (
				<PerceptionFactSuggestions
					state={suggestions ?? { status: "none" }}
					runsLeft={promptState.suggestionRunsLeft}
					website={brand?.website ?? "your website"}
					today={today}
					factPromptRoom={Math.max(0, promptState.headroom.factPromptStart - promptState.headroom.factPrompts)}
					onSuggest={async () => {
						await write(() => suggestFactsFn({ data: { brandId } }), "Couldn't start suggestions.");
						await queryClient.invalidateQueries({ queryKey: suggestionsKey(brandId) });
					}}
					onAccept={async (input) => {
						let outcome = { promptError: null as string | null };
						await write(async () => {
							outcome = await acceptFactSuggestionFn({ data: { brandId, ...input } });
						}, "Couldn't add the fact.");
						return outcome;
					}}
				/>
			)}

			{attributeState && (
				<>
					<PerceptionAttributes attributes={attributeState.attributes} maxActive={attributeState.maxActive} />
					<PerceptionAttributeSuggestions
						state={attributeSuggestions ?? { status: "none" }}
						runsLeft={attributeState.suggestionRunsLeft}
						room={attributeState.maxActive - attributeState.attributes.filter((a) => !a.retired).length}
						associationPromptsToAdd={attributeState.associationPromptsToAdd}
						headroom={attributeState.headroom}
						onSuggest={async (category) => {
							await write(() => suggestAttributesFn({ data: { brandId, category } }), "Couldn't start suggestions.");
							await queryClient.invalidateQueries({ queryKey: attributeSuggestionsKey(brandId) });
						}}
						onConfirm={async (attributes) => {
							let outcome = { associationPrompts: 0, promptError: null as string | null };
							await write(async () => {
								outcome = await confirmAttributesFn({ data: { brandId, attributes } });
							}, "Couldn't save the attributes.");
							return outcome;
						}}
					/>
				</>
			)}

			{promptState && (
				<PerceptionFactPrompts
					prompts={promptState.factPrompts}
					headroom={promptState.headroom}
					onAdd={(question) =>
						write(() => addFactPromptFn({ data: { brandId, question } }), "Couldn't add the question.")
					}
					onStop={(promptId) =>
						write(() => stopTrackingFactPromptFn({ data: { brandId, promptId } }), "Couldn't stop the question.")
					}
				/>
			)}
		</div>
	);
}
