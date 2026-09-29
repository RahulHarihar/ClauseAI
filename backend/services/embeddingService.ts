/**
 * Embeddings via Gemini REST API (gemini-embedding-001).
 *
 * Tradeoff vs local models (e.g. transformers.js):
 * - API: consistent quality, extra latency/cost, clause text sent to Google for vectors.
 * - Local: no third-party payload for embeddings, but heavier install and weaker legal-domain alignment.
 *
 * We use the API to stay aligned with the existing Gemini stack and avoid native ML deps in Bun.
 */

const EMBEDDING_MODEL = "gemini-embedding-001"

async function embedOne(apiKey: string, text: string): Promise<number[]> {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${encodeURIComponent(apiKey)}`
	const response = await fetch(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			model: `models/${EMBEDDING_MODEL}`,
			content: { parts: [{ text: text.slice(0, 8000) }] },
		}),
	})

	if (!response.ok) {
		const body = await response.text()
		throw new Error(
			`Embedding request failed (${response.status}): ${body.slice(0, 200)}`,
		)
	}

	const json = (await response.json()) as {
		embedding?: { values?: number[] }
	}
	const values = json.embedding?.values
	if (!values?.length) {
		throw new Error("Empty embedding returned from Gemini")
	}
	return values
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
	const apiKey = process.env.GEMINI_API_KEY
	if (!apiKey) {
		throw new Error("GEMINI_API_KEY is not set.")
	}

	if (texts.length === 0) return []

	const vectors: number[][] = []
	for (const text of texts) {
		vectors.push(await embedOne(apiKey, text))
	}
	return vectors
}

export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length || a.length === 0) return 0
	let dot = 0
	let normA = 0
	let normB = 0
	for (let i = 0; i < a.length; i++) {
		dot += a[i]! * b[i]!
		normA += a[i]! * a[i]!
		normB += b[i]! * b[i]!
	}
	const denom = Math.sqrt(normA) * Math.sqrt(normB)
	return denom === 0 ? 0 : dot / denom
}
