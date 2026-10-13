/** Said wherever stored mention analysis is counted, once older runs' analysis has been purged. */
export function RetentionNote({ retainedFrom }: { retainedFrom: string | null }) {
	if (!retainedFrom) return null;
	return (
		<span data-testid="retention-note">
			{" "}
			Analysis is kept from {new Date(retainedFrom).toLocaleDateString()}; runs before then aren't counted here.
		</span>
	);
}
