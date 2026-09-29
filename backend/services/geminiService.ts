import { createHash } from "node:crypto"
import { GoogleGenerativeAI } from "@google/generative-ai"

export const DEFAULT_MODELS = [
	process.env.GEMINI_MODEL || "gemini-3.6-flash",
	"gemini-3.5-flash",
	"gemini-3.5-flash-lite",
]

const ANALYSIS_PROMPT_TEMPLATE = (clausesA: string[], clausesB: string[]) => `You are a legal contract negotiation expert.

You have been given two sets of contract clauses from two different parties.

Party A clauses:
${clausesA.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Party B clauses:
${clausesB.map((c, i) => `${i + 1}. ${c}`).join("\n")}

For each conflicting clause:
1. Identify the conflict clearly
2. Explain why it matters
3. Suggest a fair compromise clause that both parties could accept
4. Flag if any clause is high risk and requires human legal review

Respond ONLY with valid JSON in exactly this format, no markdown, no backticks, no extra text:
{
  "conflicts": [
    {
      "topic": "Payment Terms",
      "partyA": "original clause from A",
      "partyB": "original clause from B",
      "conflict": "explanation of the conflict",
      "compromise": "suggested compromise language",
      "riskLevel": "low",
      "requiresLegalReview": false
    }
  ],
  "summary": "overall negotiation summary"
}`

/** Stable hash of the conflict-analysis prompt shape (for eval regression tracking). */
export function getPromptVersionHash(): string {
	const sample = ANALYSIS_PROMPT_TEMPLATE(["<clause_a>"], ["<clause_b>"])
	return createHash("sha256").update(sample).digest("hex").slice(0, 12)
}

export type AnalyzeContractsOptions = {
	/** When set, use only this model (no fallback chain). For eval comparisons. */
	model?: string
}

export type AnalyzeContractsResult = {
	text: string
	modelUsed: string
}

async function generateWithModel(
	apiKey: string,
	model: string,
	prompt: string,
): Promise<string> {
	const genAI = new GoogleGenerativeAI(apiKey)
	const generativeModel = genAI.getGenerativeModel({
		model,
		generationConfig: {
			temperature: 0.3,
			responseMimeType: "application/json",
		},
	})

	const result = await generativeModel.generateContent(prompt)
	const text = result.response.text()

	if (!text) {
		throw new Error("Empty response from Gemini")
	}

	return text
}

function isModelAccessIssue(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error)
	const lowerMessage = message.toLowerCase()
	return (
		lowerMessage.includes("not found") ||
		lowerMessage.includes("deprecated") ||
		lowerMessage.includes("not supported") ||
		lowerMessage.includes("permission_denied") ||
		lowerMessage.includes("does not exist") ||
		lowerMessage.includes("no longer available") ||
		lowerMessage.includes("404") ||
		lowerMessage.includes("503") ||
		lowerMessage.includes("unavailable") ||
		lowerMessage.includes("high demand") ||
		lowerMessage.includes("timed out") ||
		lowerMessage.includes("timeout") ||
		lowerMessage.includes("deadline exceeded") ||
		lowerMessage.includes("429") ||
		lowerMessage.includes("resource_exhausted") ||
		lowerMessage.includes("quota")
	)
}

export const analyzeContracts = async (
	clausesA: string[],
	clausesB: string[],
	options?: AnalyzeContractsOptions,
): Promise<AnalyzeContractsResult> => {
	const apiKey = process.env.GEMINI_API_KEY
	if (!apiKey) {
		throw new Error(
			"GEMINI_API_KEY is not set. Add your Gemini API key to the .env file.",
		)
	}

	const prompt = ANALYSIS_PROMPT_TEMPLATE(clausesA, clausesB)
	const modelsToTry = options?.model ? [options.model] : DEFAULT_MODELS

	let lastError: unknown

	for (const model of modelsToTry) {
		try {
			const text = await generateWithModel(apiKey, model, prompt)
			return { text, modelUsed: model }
		} catch (error) {
			if (options?.model || !isModelAccessIssue(error)) {
				throw error
			}
			lastError = error
		}
	}

	const attemptedModels = modelsToTry.join(", ")
	throw new Error(
		`All configured Gemini models are unavailable for this API key. ` +
			`Models attempted: ${attemptedModels}. ` +
			`Visit aistudio.google.com to verify your key and check model availability. ` +
			`Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
	)
}

const CLAUSE_PAIR_PROMPT = (
	pairs: { clauseA: string; clauseB: string }[],
) => `You are a legal contract negotiation expert.

Compare the following aligned clause pairs from Party A and Party B. Only report substantive conflicts where the clauses disagree on terms, obligations, timelines, liability, IP, or governing law. Skip pairs that are substantively aligned.

Clause pairs to compare:
${pairs
	.map(
		(p, i) =>
			`Pair ${i + 1}:\n  Party A: ${p.clauseA}\n  Party B: ${p.clauseB}`,
	)
	.join("\n\n")}

Respond ONLY with valid JSON in exactly this format, no markdown, no backticks, no extra text:
{
  "conflicts": [
    {
      "topic": "Payment Terms",
      "partyA": "original clause from A",
      "partyB": "original clause from B",
      "conflict": "explanation of the conflict",
      "compromise": "suggested compromise language",
      "riskLevel": "low",
      "requiresLegalReview": false
    }
  ],
  "summary": "brief note on pairs reviewed (may be empty string if none)"
}`

export type ClausePair = { clauseA: string; clauseB: string }

export async function analyzeClausePairs(
	pairs: ClausePair[],
	options?: AnalyzeContractsOptions,
): Promise<AnalyzeContractsResult> {
	const apiKey = process.env.GEMINI_API_KEY
	if (!apiKey) {
		throw new Error(
			"GEMINI_API_KEY is not set. Add your Gemini API key to the .env file.",
		)
	}

	if (pairs.length === 0) {
		return {
			text: JSON.stringify({ conflicts: [], summary: "No clause pairs to analyze." }),
			modelUsed: options?.model ?? DEFAULT_MODELS[0] ?? "gemini-3.6-flash",
		}
	}

	const prompt = CLAUSE_PAIR_PROMPT(pairs)
	const modelsToTry = options?.model ? [options.model] : DEFAULT_MODELS

	let lastError: unknown

	for (const model of modelsToTry) {
		try {
			const text = await generateWithModel(apiKey, model, prompt)
			return { text, modelUsed: model }
		} catch (error) {
			if (options?.model || !isModelAccessIssue(error)) {
				throw error
			}
			lastError = error
		}
	}

	const attemptedModels = modelsToTry.join(", ")
	throw new Error(
		`All configured Gemini models are unavailable for this API key. Models attempted: ${attemptedModels}.`,
	)
}

export function getClausePairPromptVersionHash(): string {
	const sample = CLAUSE_PAIR_PROMPT([
		{ clauseA: "<a>", clauseB: "<b>" },
	])
	return createHash("sha256").update(sample).digest("hex").slice(0, 12)
}
