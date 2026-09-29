import { describe, expect, test } from "bun:test"
import { sameIndexPairScore } from "../../backend/services/retrievalService"

describe("retrieval baseline", () => {
	test("same-index alignment fails when B clauses are reordered", () => {
		const clausesA = [
			"1. Payment. Net 30 from invoice date.",
			"2. Governing Law. Delaware.",
		]
		const clausesB = [
			"1. Governing Law. California applies.",
			"2. Payment. Net 60 from invoice date.",
		]
		const score = sameIndexPairScore(clausesA, clausesB)
		expect(score).toBeLessThan(0.5)
	})
})
