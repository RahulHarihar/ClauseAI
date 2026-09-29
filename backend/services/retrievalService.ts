import { cosineSimilarity, embedTexts } from "./embeddingService"

export type RetrievedPair = {
	clauseA: string
	clauseB: string
	score: number
	indexA: number
	indexB: number
}

/**
 * For each clause in A, retrieve top-k semantically similar clauses from B (in-memory cosine search).
 */
export async function retrieveClausePairs(
	clausesA: string[],
	clausesB: string[],
	topK = 3,
): Promise<RetrievedPair[]> {
	if (clausesA.length === 0 || clausesB.length === 0) return []

	const [embedA, embedB] = await Promise.all([
		embedTexts(clausesA),
		embedTexts(clausesB),
	])

	const seen = new Set<string>()
	const pairs: RetrievedPair[] = []

	for (let i = 0; i < clausesA.length; i++) {
		const scores: { j: number; score: number }[] = []
		for (let j = 0; j < clausesB.length; j++) {
			scores.push({
				j,
				score: cosineSimilarity(embedA[i]!, embedB[j]!),
			})
		}
		scores.sort((x, y) => y.score - x.score)

		for (const { j, score } of scores.slice(0, topK)) {
			const key = `${i}:${j}`
			if (seen.has(key)) continue
			seen.add(key)
			pairs.push({
				clauseA: clausesA[i]!,
				clauseB: clausesB[j]!,
				score,
				indexA: i,
				indexB: j,
			})
		}
	}

	return pairs
}

/** Same-index alignment score (baseline for eval: retrieval should beat this on shifted docs). */
export function sameIndexPairScore(
	clausesA: string[],
	clausesB: string[],
): number {
	const n = Math.min(clausesA.length, clausesB.length)
	if (n === 0) return 0
	let hits = 0
	for (let i = 0; i < n; i++) {
		const a = clausesA[i]!.toLowerCase()
		const b = clausesB[i]!.toLowerCase()
		if (a.slice(0, 40) === b.slice(0, 40)) hits++
	}
	return hits / n
}
