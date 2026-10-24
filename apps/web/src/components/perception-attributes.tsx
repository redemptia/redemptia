import { Badge } from "@workspace/ui/components/badge";

export interface AttributeRow {
	id: string;
	label: string;
	questionText: string;
	questionVersion: number;
	marketPromptText: string;
	retired: boolean;
}

/** The brand's attributes as saved: what the judge asks of each, and which question version is current. */
export function PerceptionAttributes({ attributes, maxActive }: { attributes: AttributeRow[]; maxActive: number }) {
	const active = attributes.filter((attribute) => !attribute.retired);
	const retired = attributes.filter((attribute) => attribute.retired);
	return (
		<div className="space-y-3">
			<div>
				<h2 className="text-xl font-semibold">Attributes</h2>
				<p className="text-sm text-muted-foreground">
					{active.length} of {maxActive} active. Answers to your association prompts are judged on each one.
				</p>
			</div>
			{active.length === 0 ? (
				<p className="text-sm text-muted-foreground">No attributes yet. Suggest some below.</p>
			) : (
				<ul className="space-y-2">
					{active.map((attribute) => (
						<li key={attribute.id} className="rounded-lg border p-3">
							<div className="flex items-center gap-2">
								<span className="font-medium">{attribute.label}</span>
								{attribute.questionVersion > 1 && <Badge variant="secondary">v{attribute.questionVersion}</Badge>}
							</div>
							<p className="text-sm text-muted-foreground">
								{attribute.questionText.replace("{subject}", "your brand")}
							</p>
						</li>
					))}
				</ul>
			)}
			{retired.length > 0 && (
				<p className="text-sm text-muted-foreground">
					Retired: {retired.map((attribute) => attribute.label).join(", ")}. Their history is kept.
				</p>
			)}
		</div>
	);
}
