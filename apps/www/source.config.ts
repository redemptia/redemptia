import { remarkFeedbackBlock } from "fumadocs-core/mdx-plugins/remark-feedback-block";
import { defineConfig, defineDocs } from "fumadocs-mdx/config";

export const docs = defineDocs({
	dir: "../../packages/docs/content/docs",
	docs: {
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
});

export default defineConfig({
	mdxOptions: {
		remarkPlugins: [[remarkFeedbackBlock]],
	},
});
