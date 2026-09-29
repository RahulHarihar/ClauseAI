import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { segmentClauses } from "../services/clauseSegmenter"
import { extractTextFromPDF } from "../services/pdfParser"

const REPO = resolve(import.meta.dir, "../..")

describe("clauseSegmenter", () => {
	test("pair_005 produces many clauses (long-contract path)", async () => {
		const pdfPath = join(REPO, "eval", "dataset", "pair_005", "doc_a.pdf")
		const buf = readFileSync(pdfPath)
		const text = await extractTextFromPDF(buf)
		const clauses = segmentClauses(text)
		expect(clauses.length).toBeGreaterThan(20)
	})
})
