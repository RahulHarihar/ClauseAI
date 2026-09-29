import { segmentClauses } from "./clauseSegmenter"
import {
	analyzeClausePairs,
	analyzeContracts,
	type AnalyzeContractsOptions,
	type ClausePair,
} from "./geminiService"
import { extractTextFromPDF } from "./pdfParser"
import { retrieveClausePairs } from "./retrievalService"

export type DetectedConflict = {
	topic: string
	partyA: string
	partyB: string
	conflict: string
	compromise: string
	riskLevel: string
	requiresLegalReview: boolean
}

export type AnalysisResult = {
	conflicts: DetectedConflict[]
	summary: string
	modelUsed: string
}

export type PipelineMode = "full_document" | "retrieval"

export type RunPipelineOptions = AnalyzeContractsOptions & {
	mode?: PipelineMode
	pairBatchSize?: number
	retrievalTopK?: number
}

const DEFAULT_BATCH = 8

function parseAnalysisJson(text: string): AnalysisResult {
	const parsed = JSON.parse(text) as {
		conflicts?: DetectedConflict[]
		summary?: string
	}
	return {
		conflicts: parsed.conflicts ?? [],
		summary: parsed.summary ?? "",
		modelUsed: "",
	}
}

function dedupeConflicts(conflicts: DetectedConflict[]): DetectedConflict[] {
	const seen = new Set<string>()
	const out: DetectedConflict[] = []
	for (const c of conflicts) {
		const key = `${c.topic}|${c.partyA.slice(0, 80)}|${c.partyB.slice(0, 80)}`.toLowerCase()
		if (seen.has(key)) continue
		seen.add(key)
		out.push(c)
	}
	return out
}

async function runRetrievalPipeline(
	clausesA: string[],
	clausesB: string[],
	options?: RunPipelineOptions,
): Promise<AnalysisResult> {
	const topK = options?.retrievalTopK ?? 3
	const batchSize = options?.pairBatchSize ?? DEFAULT_BATCH

	const retrieved = await retrieveClausePairs(clausesA, clausesB, topK)
	const pairs: ClausePair[] = retrieved.map((p) => ({
		clauseA: p.clauseA,
		clauseB: p.clauseB,
	}))

	let modelUsed = options?.model ?? ""
	const allConflicts: DetectedConflict[] = []
	const summaries: string[] = []

	for (let i = 0; i < pairs.length; i += batchSize) {
		const batch = pairs.slice(i, i + batchSize)
		const { text, modelUsed: used } = await analyzeClausePairs(batch, options)
		modelUsed = used
		const partial = parseAnalysisJson(text)
		allConflicts.push(...partial.conflicts)
		if (partial.summary) summaries.push(partial.summary)
	}

	return {
		conflicts: dedupeConflicts(allConflicts),
		summary: summaries.join(" ") || "Retrieval-based clause comparison complete.",
		modelUsed,
	}
}

/** End-to-end analysis from PDF buffers (used by API and eval). */
export async function runContractPipeline(
	bufferA: Buffer,
	bufferB: Buffer,
	options?: RunPipelineOptions,
): Promise<AnalysisResult & { clausesA: string[]; clausesB: string[] }> {
	const textA = await extractTextFromPDF(bufferA)
	const textB = await extractTextFromPDF(bufferB)

	const clausesA = segmentClauses(textA)
	const clausesB = segmentClauses(textB)

	if (clausesA.length === 0 || clausesB.length === 0) {
		throw new Error("Could not extract clauses from one or both documents.")
	}

	const mode = options?.mode ?? "retrieval"

	let result: AnalysisResult
	if (mode === "full_document") {
		const { text, modelUsed } = await analyzeContracts(clausesA, clausesB, options)
		result = { ...parseAnalysisJson(text), modelUsed }
	} else {
		result = await runRetrievalPipeline(clausesA, clausesB, options)
	}

	return { ...result, clausesA, clausesB }
}
