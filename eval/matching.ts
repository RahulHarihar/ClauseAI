export type GroundTruthConflict = {
	category: string
	clause_a_excerpt: string
	clause_b_excerpt: string
	description: string
}

export type DetectedConflict = {
	topic: string
	partyA: string
	partyB: string
	conflict: string
}

const normalize = (s: string) =>
	s
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.replace(/\s+/g, " ")
		.trim()

function tokenSet(s: string): Set<string> {
	return new Set(normalize(s).split(" ").filter((t) => t.length > 2))
}

/** Token Jaccard similarity in [0, 1]. */
export function tokenJaccard(a: string, b: string): number {
	const ta = tokenSet(a)
	const tb = tokenSet(b)
	if (ta.size === 0 && tb.size === 0) return 1
	if (ta.size === 0 || tb.size === 0) return 0
	let inter = 0
	for (const t of ta) {
		if (tb.has(t)) inter++
	}
	const union = ta.size + tb.size - inter
	return union === 0 ? 0 : inter / union
}

/** Longest common substring length ratio (substring overlap signal). */
function lcsRatio(a: string, b: string): number {
	const x = normalize(a)
	const y = normalize(b)
	if (!x.length || !y.length) return 0
	const dp: number[][] = Array.from({ length: x.length + 1 }, () =>
		Array(y.length + 1).fill(0),
	)
	let best = 0
	for (let i = 1; i <= x.length; i++) {
		for (let j = 1; j <= y.length; j++) {
			if (x[i - 1] === y[j - 1]) {
				dp[i]![j] = dp[i - 1]![j - 1]! + 1
				best = Math.max(best, dp[i]![j]!)
			}
		}
	}
	return best / Math.max(x.length, y.length)
}

export function excerptSimilarity(a: string, b: string): number {
	const na = normalize(a)
	const nb = normalize(b)
	if (na.includes(nb) || nb.includes(na)) return 1
	return Math.max(tokenJaccard(a, b), lcsRatio(a, b))
}

const MATCH_THRESHOLD = 0.35

export type MatchAssignment = {
	gtIndex: number
	detectedIndex: number
	score: number
}

/** Greedy one-to-one matching between ground truth and detections. */
export function matchConflicts(
	groundTruth: GroundTruthConflict[],
	detected: DetectedConflict[],
	threshold = MATCH_THRESHOLD,
): { assignments: MatchAssignment[]; unmatchedGt: number[]; unmatchedDet: number[] } {
	const candidates: MatchAssignment[] = []

	for (let gi = 0; gi < groundTruth.length; gi++) {
		const gt = groundTruth[gi]!
		for (let di = 0; di < detected.length; di++) {
			const det = detected[di]!
			const direct =
				(excerptSimilarity(det.partyA, gt.clause_a_excerpt) +
					excerptSimilarity(det.partyB, gt.clause_b_excerpt)) /
				2
			const swapped =
				(excerptSimilarity(det.partyA, gt.clause_b_excerpt) +
					excerptSimilarity(det.partyB, gt.clause_a_excerpt)) /
				2
			const descBoost = Math.max(
				excerptSimilarity(det.conflict, gt.description),
				excerptSimilarity(det.topic, gt.category.replace(/_/g, " ")),
			)
			const score = Math.max(direct, swapped, descBoost * 0.9)
			if (score >= threshold) {
				candidates.push({ gtIndex: gi, detectedIndex: di, score })
			}
		}
	}

	candidates.sort((a, b) => b.score - a.score)
	const usedGt = new Set<number>()
	const usedDet = new Set<number>()
	const assignments: MatchAssignment[] = []

	for (const c of candidates) {
		if (usedGt.has(c.gtIndex) || usedDet.has(c.detectedIndex)) continue
		usedGt.add(c.gtIndex)
		usedDet.add(c.detectedIndex)
		assignments.push(c)
	}

	const unmatchedGt: number[] = []
	const unmatchedDet: number[] = []
	for (let gi = 0; gi < groundTruth.length; gi++) {
		if (!usedGt.has(gi)) unmatchedGt.push(gi)
	}
	for (let di = 0; di < detected.length; di++) {
		if (!usedDet.has(di)) unmatchedDet.push(di)
	}

	return { assignments, unmatchedGt, unmatchedDet }
}

export function computeMetrics(
	tp: number,
	fp: number,
	fn: number,
): { precision: number; recall: number; f1: number } {
	const precision = tp + fp === 0 ? (tp === 0 ? 1 : 0) : tp / (tp + fp)
	const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
	const f1 =
		precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
	return { precision, recall, f1 }
}
