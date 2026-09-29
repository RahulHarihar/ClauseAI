import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { runContractPipeline } from "../backend/services/contractPipeline"
import {
	DEFAULT_MODELS,
	getClausePairPromptVersionHash,
	getPromptVersionHash,
} from "../backend/services/geminiService"
import {
	computeMetrics,
	matchConflicts,
	type GroundTruthConflict,
} from "./matching"

const REPO_ROOT = resolve(import.meta.dir, "..")
const DATASET_DIR = join(REPO_ROOT, "eval", "dataset")
const RESULTS_CSV = join(REPO_ROOT, "eval", "results_history.csv")

type EvalPair = {
	id: string
	doc_a_path: string
	doc_b_path: string
	ground_truth_conflicts: GroundTruthConflict[]
}

function loadEnv() {
	const envPath = join(REPO_ROOT, "backend", ".env")
	if (existsSync(envPath)) {
		const content = readFileSync(envPath, "utf8")
		for (const line of content.split("\n")) {
			const trimmed = line.trim()
			if (!trimmed || trimmed.startsWith("#")) continue
			const eq = trimmed.indexOf("=")
			if (eq === -1) continue
			const key = trimmed.slice(0, eq).trim()
			const value = trimmed.slice(eq + 1).trim()
			if (!process.env[key]) process.env[key] = value
		}
	}
}

function parseArgs() {
	const args = process.argv.slice(2)
	let model: string | undefined
	let mode: "full_document" | "retrieval" = "retrieval"
	let dryRun = false

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--model" && args[i + 1]) {
			model = args[++i]
		} else if (args[i] === "--mode" && args[i + 1]) {
			const m = args[++i]
			if (m === "full_document" || m === "retrieval") mode = m
		} else if (args[i] === "--dry-run") {
			dryRun = true
		}
	}

	return { model, mode, dryRun }
}

function loadPairs(): EvalPair[] {
	const entries = readdirSync(DATASET_DIR, { withFileTypes: true })
	const pairs: EvalPair[] = []

	for (const ent of entries) {
		if (!ent.isDirectory() || !ent.name.startsWith("pair_")) continue
		const manifestPath = join(DATASET_DIR, ent.name, "manifest.json")
		if (!existsSync(manifestPath)) continue
		const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as EvalPair
		pairs.push({
			...raw,
			doc_a_path: join(REPO_ROOT, raw.doc_a_path),
			doc_b_path: join(REPO_ROOT, raw.doc_b_path),
		})
	}

	pairs.sort((a, b) => a.id.localeCompare(b.id))
	return pairs
}

function ensureResultsHeader() {
	if (!existsSync(RESULTS_CSV)) {
		const header =
			"timestamp,model,prompt_hash,pipeline_mode,precision,recall,f1,pairs_evaluated,tp,fp,fn\n"
		mkdirSync(join(REPO_ROOT, "eval"), { recursive: true })
		appendFileSync(RESULTS_CSV, header)
	}
}

function printTable(rows: string[][]) {
	const widths = rows[0]!.map((_, col) =>
		Math.max(...rows.map((r) => r[col]!.length)),
	)
	for (const row of rows) {
		console.log(
			row.map((cell, i) => cell.padEnd(widths[i]!)).join("  "),
		)
	}
}

async function main() {
	loadEnv()
	const { model, mode, dryRun } = parseArgs()
	const pairs = loadPairs()

	if (pairs.length === 0) {
		console.error("No eval pairs found under eval/dataset/pair_*/manifest.json")
		process.exit(1)
	}

	const promptHash =
		mode === "retrieval"
			? getClausePairPromptVersionHash()
			: getPromptVersionHash()

	const modelLabel = model ?? `fallback(${DEFAULT_MODELS.join(">")})`

	console.log(`ClauseAI eval — ${pairs.length} pairs, mode=${mode}, model=${modelLabel}`)
	console.log(`Prompt version hash: ${promptHash}`)
	if (dryRun) {
		console.log("Dry run: skipping API calls.")
		process.exit(0)
	}

	let totalTp = 0
	let totalFp = 0
	let totalFn = 0
	const byCategory = new Map<
		string,
		{ tp: number; fp: number; fn: number }
	>()

	const tableRows: string[][] = [
		["pair", "category", "precision", "recall", "F1", "TP", "FP", "FN"],
	]

	for (const pair of pairs) {
		const bufferA = readFileSync(pair.doc_a_path)
		const bufferB = readFileSync(pair.doc_b_path)

		const result = await runContractPipeline(bufferA, bufferB, {
			model,
			mode,
		})

		const { assignments, unmatchedGt, unmatchedDet } = matchConflicts(
			pair.ground_truth_conflicts,
			result.conflicts,
		)

		const tp = assignments.length
		const fp = unmatchedDet.length
		const fn = unmatchedGt.length
		totalTp += tp
		totalFp += fp
		totalFn += fn

		const overall = computeMetrics(tp, fp, fn)
		tableRows.push([
			pair.id,
			"(all)",
			overall.precision.toFixed(3),
			overall.recall.toFixed(3),
			overall.f1.toFixed(3),
			String(tp),
			String(fp),
			String(fn),
		])

		for (const gt of pair.ground_truth_conflicts) {
			if (!byCategory.has(gt.category)) {
				byCategory.set(gt.category, { tp: 0, fp: 0, fn: 0 })
			}
		}

		const matchedGt = new Set(assignments.map((a) => a.gtIndex))
		for (let gi = 0; gi < pair.ground_truth_conflicts.length; gi++) {
			const cat = pair.ground_truth_conflicts[gi]!.category
			const bucket = byCategory.get(cat)!
			if (matchedGt.has(gi)) bucket.tp++
			else bucket.fn++
		}
	}

	console.log("\nPer-pair metrics:\n")
	printTable(tableRows)

	console.log("\nPer-category (ground-truth coverage):\n")
	const catRows: string[][] = [["category", "TP", "FN", "recall"]]
	for (const [cat, { tp, fn }] of [...byCategory.entries()].sort()) {
		const recall = tp + fn === 0 ? 1 : tp / (tp + fn)
		catRows.push([cat, String(tp), String(fn), recall.toFixed(3)])
	}
	printTable(catRows)

	const aggregate = computeMetrics(totalTp, totalFp, totalFn)
	console.log("\nOverall:")
	console.log(
		`  precision=${aggregate.precision.toFixed(3)} recall=${aggregate.recall.toFixed(3)} f1=${aggregate.f1.toFixed(3)}`,
	)
	console.log(`  TP=${totalTp} FP=${totalFp} FN=${totalFn}`)
	console.log(`  model used on last pair: (varies per fallback)`)

	ensureResultsHeader()
	const row = [
		new Date().toISOString(),
		modelLabel,
		promptHash,
		mode,
		aggregate.precision.toFixed(4),
		aggregate.recall.toFixed(4),
		aggregate.f1.toFixed(4),
		String(pairs.length),
		String(totalTp),
		String(totalFp),
		String(totalFn),
	].join(",")
	appendFileSync(RESULTS_CSV, `${row}\n`)
	console.log(`\nAppended results to ${RESULTS_CSV}`)
}

main().catch((err) => {
	console.error("Eval failed:", err instanceof Error ? err.message : err)
	process.exit(1)
})
