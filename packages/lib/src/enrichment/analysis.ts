import { createHash } from "node:crypto";
import { locateSubject, type MentionSubject } from "../mentions";

export interface AnalysisSubject extends MentionSubject {
	/** A competitor's id, or the brand's id for the brand itself. */
	key: string;
	kind: "brand" | "competitor";
}

export interface SubjectMentionRow {
	subjectKey: string;
	subjectKind: AnalysisSubject["kind"];
	subjectName: string;
	firstOffset: number;
	position: number;
}

interface BrandInput {
	id: string;
	name: string;
	website: string;
	aliases: string[];
	additionalDomains: string[];
}

interface CompetitorInput {
	id: string;
	name: string;
	aliases: string[];
	domains: string[];
}

/** The same subjects, with the same domains, that process-prompt hands analyzeMentions. */
export function brandSubjects(brand: BrandInput, competitors: readonly CompetitorInput[]): AnalysisSubject[] {
	return [
		{
			key: brand.id,
			kind: "brand",
			name: brand.name,
			aliases: brand.aliases,
			domains: [brand.website, ...brand.additionalDomains],
		},
		...competitors.map((competitor) => ({
			key: competitor.id,
			kind: "competitor" as const,
			name: competitor.name,
			aliases: competitor.aliases,
			domains: competitor.domains,
		})),
	];
}

/** Whether a brand update sets any column brandSubjects reads, and so leaves its stored analysis stale. */
export function touchesSubjects(
	update: Partial<Record<"name" | "website" | "aliases" | "additionalDomains", unknown>>,
): boolean {
	return (["name", "website", "aliases", "additionalDomains"] as const).some((column) => update[column] !== undefined);
}

/**
 * Changes whenever anything analysis reads about a brand's subjects changes,
 * so a stored analysis can tell it was computed against an older set. It hashes
 * the raw stored values rather than the normalised terms: a whitespace-only edit
 * then costs a needless recompute, but the fingerprint never has to track the
 * matching rule.
 */
export function subjectFingerprint(subjects: readonly AnalysisSubject[]): string {
	const canonical = [...subjects]
		.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
		.map((subject) => [
			subject.key,
			subject.kind,
			subject.name,
			[...(subject.aliases ?? [])].sort(),
			(subject.domains ?? []).filter((domain): domain is string => domain != null).sort(),
		]);
	return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}

/** One row per subject the answer mentions; an answer with no text mentions nothing. */
export function analyzeRun(text: string | null, subjects: readonly AnalysisSubject[]): SubjectMentionRow[] {
	if (text === null) return [];
	const contentLower = text.toLowerCase();
	const rows: SubjectMentionRow[] = [];
	for (const subject of subjects) {
		const location = locateSubject(contentLower, subject);
		if (!location) continue;
		rows.push({
			subjectKey: subject.key,
			subjectKind: subject.kind,
			subjectName: subject.name,
			firstOffset: location.first,
			position: location.position,
		});
	}
	return rows;
}
