import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { textToPdfBuffer } from "../../eval/scripts/pdfUtil"
import { extractTextFromPDF } from "../services/pdfParser"

describe("PDF processing privacy", () => {
	let tempDir: string

	beforeEach(() => {
		tempDir = mkdtempSync(join(tmpdir(), "clauseai-privacy-"))
	})

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true })
	})

	test("extractTextFromPDF does not write temp files to disk", async () => {
		const pdf = textToPdfBuffer(
			"1. Payment. Net 30.\n\n2. Liability. Cap at fees paid.",
		)
		const before = readdirSync(tempDir)
		expect(before.length).toBe(0)

		const text = await extractTextFromPDF(pdf)
		expect(text.toLowerCase()).toContain("net 30")

		const after = readdirSync(tempDir)
		expect(after.length).toBe(0)
	})
})
