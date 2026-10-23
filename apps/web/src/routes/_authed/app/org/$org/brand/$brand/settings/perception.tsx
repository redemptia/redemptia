import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Label } from "@workspace/ui/components/label";
import { Switch } from "@workspace/ui/components/switch";
import { useState } from "react";
import { type FactActions, PerceptionFactsEditor } from "@/components/perception-facts-editor";
import { useBrandId } from "@/hooks/use-brand-id";
import { pageHead } from "@/lib/route-head";
import { useWriteErrorMessage } from "@/lib/write-errors";
import {
	addFactFn,
	deleteFactFn,
	getPerceptionSettingsFn,
	recordFactChangeFn,
	retireFactFn,
	setPerceptionEnabledFn,
} from "@/server/perception-facts";

export const Route = createFileRoute("/_authed/app/org/$org/brand/$brand/settings/perception")({
	staticData: { crumb: "Perception" },
	head: pageHead({ description: "Record your brand's facts and turn perception on." }),
	component: PerceptionSettingsPage,
});

const settingsKey = (brandId: string) => ["perception-settings", brandId] as const;

function PerceptionSettingsPage() {
	const brandId = useBrandId();
	const queryClient = useQueryClient();
	const writeError = useWriteErrorMessage();
	const [switchError, setSwitchError] = useState<string | null>(null);
	const { data, isLoading } = useQuery({
		queryKey: settingsKey(brandId),
		queryFn: () => getPerceptionSettingsFn({ data: { brandId } }),
	});
	const refresh = () => queryClient.invalidateQueries({ queryKey: settingsKey(brandId) });
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
		</div>
	);
}
