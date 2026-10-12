import { createFileRoute } from "@tanstack/react-router";
import { parseAnalyticsFilters, parseAnalyticsWindow, publicRange } from "@/lib/api/analytics-range";
import { createApiHandler, withMethodGuard } from "@/lib/api/handler";
import { requireBrandInScope } from "@/lib/api/scope";
import { getBrandMentionProminence } from "@/server/analytics-core";

export const Route = createFileRoute("/api/v1/brands/$brandId/mention-prominence")({
	server: {
		handlers: withMethodGuard({
			GET: createApiHandler({
				scopes: ["read"],
				handle: async ({ params, request, auth }) => {
					const brand = await requireBrandInScope(auth, params.brandId);
					const url = new URL(request.url);
					const range = parseAnalyticsWindow(url);
					const result = await getBrandMentionProminence(brand.id, range, parseAnalyticsFilters(url));
					return { brandId: brand.id, range: publicRange(range), ...result };
				},
			}),
		}),
	},
});
