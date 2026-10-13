import { getOrgEntitlements } from "@workspace/lib/entitlements";
import { ApiError } from "@/lib/api/handler";

export const SENTIMENT_NOT_IN_PLAN =
	"Sentiment isn't included in this organization's plan. It's available on Basic and above; mention prominence and rank are on every plan.";

/** Whether the org's plan includes model-judged stance. Every edge of the sentiment read asks this after its tenancy gate. */
export async function sentimentInPlan(organizationId: string): Promise<boolean> {
	return (await getOrgEntitlements(organizationId)).sentimentAnalysis;
}

export async function requireSentimentInPlan(organizationId: string): Promise<void> {
	if (!(await sentimentInPlan(organizationId))) {
		throw new ApiError(403, "Forbidden", SENTIMENT_NOT_IN_PLAN, "sentiment_not_in_plan");
	}
}
