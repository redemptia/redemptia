import { describe, expect, it } from "vitest";
import { describeTargets } from "@/lib/perception-cost";

describe("describeTargets", () => {
	it("lists each model once and says when sources share one", () => {
		expect(describeTargets([{ model: "chatgpt" }, { model: "chatgpt" }])).toBe("1 model (chatgpt) through 2 sources");
		expect(describeTargets([{ model: "chatgpt" }, { model: "perplexity" }])).toBe("2 models (chatgpt, perplexity)");
		expect(describeTargets([{ model: "chatgpt" }])).toBe("1 model (chatgpt)");
		expect(describeTargets([])).toBe("0 models (none enabled)");
	});
});
