import { z } from "zod";
import goldenSetFile from "./golden-set.json";
import { STANCES, type Stance } from "./prompt";

export interface GoldenAnswer {
	id: string;
	answer: string;
	/** Subject name → the stance a human assigned. */
	labels: Record<string, Stance>;
}

const goldenSetSchema = z.object({
	answers: z.array(z.object({ id: z.string(), answer: z.string(), labels: z.record(z.string(), z.enum(STANCES)) })),
});

/** The golden set, validated, so a mistyped label fails loudly instead of scoring as a miss. */
export function loadGoldenSet(): GoldenAnswer[] {
	return goldenSetSchema.parse(goldenSetFile).answers;
}

export interface EvalPrediction {
	answerId: string;
	subject: string;
	gold: Stance;
	/** Null when the model returned no judgement for the subject. */
	predicted: Stance | null;
}

export interface EvalReport {
	overall: { correct: number; total: number; agreement: number };
	/** Per gold class: how many of that class the model labelled the same. */
	perClass: Record<Stance, { correct: number; total: number; agreement: number | null }>;
	/** gold → predicted → count, with "missing" for no judgement. */
	confusion: Record<Stance, Record<Stance | "missing", number>>;
}

const ratio = (correct: number, total: number) => (total === 0 ? null : correct / total);

/** Agreement with the golden labels, overall and per gold class (a class's recall). */
export function scoreSentimentEval(predictions: readonly EvalPrediction[]): EvalReport {
	const perClass = Object.fromEntries(
		STANCES.map((s) => [s, { correct: 0, total: 0, agreement: null }]),
	) as EvalReport["perClass"];
	const confusion = Object.fromEntries(
		STANCES.map((g) => [g, Object.fromEntries([...STANCES, "missing"].map((p) => [p, 0]))]),
	) as EvalReport["confusion"];
	let correct = 0;
	for (const p of predictions) {
		const hit = p.predicted === p.gold;
		if (hit) correct++;
		perClass[p.gold].total++;
		if (hit) perClass[p.gold].correct++;
		confusion[p.gold][p.predicted ?? "missing"]++;
	}
	for (const s of STANCES) perClass[s].agreement = ratio(perClass[s].correct, perClass[s].total);
	return {
		overall: { correct, total: predictions.length, agreement: ratio(correct, predictions.length) ?? 0 },
		perClass,
		confusion,
	};
}
