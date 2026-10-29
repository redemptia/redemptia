import { getDeployment } from "@workspace/deployment";
import { perceptionAvailableIn } from "@workspace/lib/perception/limits";
import { requireBrandSession } from "@/lib/auth/helpers";

/** The session check every perception server function starts with: the deployment mode, then the brand. */
export async function requirePerceptionSession(brandId: string) {
	if (!perceptionAvailableIn(getDeployment().mode)) {
		throw new Error("Perception isn't available in this deployment mode");
	}
	return requireBrandSession(brandId);
}
