import { describe, expect, test } from "bun:test"
import {
	excerptSimilarity,
	matchConflicts,
	computeMetrics,
} from "../matching"

describe("eval matching", () => {
	test("matches overlapping excerpts", () => {
		const sim = excerptSimilarity(
			"Payment due within thirty (30) days of invoice",
			"paid within thirty (30) days",
		)
		expect(sim).toBeGreaterThan(0.35)
	})

	test("computes precision and recall", () => {
		const gt = [
			{
				category: "payment_timeline",
				clause_a_excerpt: "Net 30",
				clause_b_excerpt: "Net 60",
				description: "Payment terms differ",
			},
		]
		const det = [
			{
				topic: "Payment",
				partyA: "Invoices paid Net 30",
				partyB: "Invoices paid Net 60",
				conflict: "Payment terms differ",
			},
		]
		const { assignments, unmatchedGt, unmatchedDet } = matchConflicts(gt, det)
		expect(assignments.length).toBe(1)
		expect(unmatchedGt.length).toBe(0)
		expect(unmatchedDet.length).toBe(0)
		const m = computeMetrics(1, 0, 0)
		expect(m.precision).toBe(1)
		expect(m.recall).toBe(1)
	})
})
