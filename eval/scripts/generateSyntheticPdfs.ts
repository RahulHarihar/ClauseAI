/**
 * Generates synthetic eval PDFs (plain text embedded in minimal PDF 1.4 streams).
 * Run: bun eval/scripts/generateSyntheticPdfs.ts
 */

import { mkdirSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { textToPdfBuffer } from "./pdfUtil"

const REPO_ROOT = resolve(import.meta.dir, "../..")

type PairSpec = {
	id: string
	docA: string
	docB: string
	ground_truth_conflicts: {
		category: string
		clause_a_excerpt: string
		clause_b_excerpt: string
		description: string
	}[]
}

const PAIRS: PairSpec[] = [
	{
		id: "pair_001",
		docA: `MASTER SERVICES AGREEMENT — Party A Draft

1. Payment Terms. Invoices shall be paid within thirty (30) days of receipt (Net 30). Late payments accrue interest at 1.5% per month.

2. Limitation of Liability. Total liability shall not exceed fees paid in the twelve months preceding the claim.

3. Governing Law. This Agreement is governed by the laws of the State of Delaware.

4. Confidentiality. Confidential Information must be protected for two (2) years after disclosure.`,
		docB: `MASTER SERVICES AGREEMENT — Party B Draft

1. Payment Terms. Client shall remit payment within sixty (60) days of invoice date (Net 60). No interest on late payments unless required by law.

2. Limitation of Liability. Aggregate liability is capped at two times (2x) fees paid in the prior twelve months.

3. Governing Law. This Agreement is governed by the laws of the State of California.

4. Confidentiality. Obligations survive for five (5) years from the date of disclosure.`,
		ground_truth_conflicts: [
			{
				category: "payment_timeline",
				clause_a_excerpt: "paid within thirty (30) days",
				clause_b_excerpt: "sixty (60) days of invoice",
				description: "Doc A specifies Net 30, Doc B specifies Net 60",
			},
			{
				category: "liability_cap",
				clause_a_excerpt: "not exceed fees paid in the twelve months",
				clause_b_excerpt: "two times (2x) fees paid",
				description: "Different liability caps (1x vs 2x annual fees)",
			},
			{
				category: "governing_law",
				clause_a_excerpt: "State of Delaware",
				clause_b_excerpt: "State of California",
				description: "Delaware vs California governing law",
			},
			{
				category: "confidentiality_period",
				clause_a_excerpt: "two (2) years after disclosure",
				clause_b_excerpt: "five (5) years from the date",
				description: "2-year vs 5-year confidentiality period",
			},
		],
	},
	{
		id: "pair_002",
		docA: `SOFTWARE LICENSE — Vendor A

1. Intellectual Property. All deliverables are work-made-for-hire and owned exclusively by Customer upon payment.

2. Support. Vendor provides 8x5 email support with 48-hour response SLA.

3. Termination. Either party may terminate for convenience with 30 days written notice.`,
		docB: `SOFTWARE LICENSE — Vendor B

1. Intellectual Property. Vendor grants Customer a non-exclusive license; Vendor retains all IP rights in the software and derivatives.

2. Support. Vendor provides 24x7 phone support with 4-hour response for severity-one issues.

3. Termination. Termination for convenience requires 90 days notice and payment of early termination fees.`,
		ground_truth_conflicts: [
			{
				category: "ip_ownership",
				clause_a_excerpt: "work-made-for-hire and owned exclusively by Customer",
				clause_b_excerpt: "Vendor retains all IP rights",
				description: "Work-for-hire ownership vs license with vendor retention",
			},
			{
				category: "support_sla",
				clause_a_excerpt: "8x5 email support with 48-hour",
				clause_b_excerpt: "24x7 phone support with 4-hour",
				description: "Different support coverage and response times",
			},
			{
				category: "termination_notice",
				clause_a_excerpt: "30 days written notice",
				clause_b_excerpt: "90 days notice and payment of early termination",
				description: "30-day vs 90-day termination for convenience",
			},
		],
	},
	{
		id: "pair_003",
		docA: `NDA — Disclosing Party Friendly

1. Definition. Confidential Information includes all business, technical, and financial data shared in any form.

2. Term. This NDA remains in effect for three (3) years from the Effective Date.

3. Non-Solicitation. Recipient shall not solicit employees of Discloser for twelve (12) months.`,
		docB: `NDA — Receiving Party Friendly

1. Definition. Confidential Information is limited to documents marked "Confidential" in writing at time of disclosure.

2. Term. Obligations expire one (1) year after the Effective Date unless trade secret.

3. Non-Solicitation. No employee non-solicitation obligations apply under this agreement.`,
		ground_truth_conflicts: [
			{
				category: "confidentiality_scope",
				clause_a_excerpt: "all business, technical, and financial data",
				clause_b_excerpt: "marked \"Confidential\" in writing",
				description: "Broad vs marked-only definition of confidential information",
			},
			{
				category: "nda_term",
				clause_a_excerpt: "three (3) years from the Effective Date",
				clause_b_excerpt: "one (1) year after the Effective Date",
				description: "3-year vs 1-year NDA term",
			},
			{
				category: "non_solicitation",
				clause_a_excerpt: "not solicit employees for twelve (12) months",
				clause_b_excerpt: "No employee non-solicitation obligations",
				description: "12-month non-solicit vs none",
			},
		],
	},
	{
		id: "pair_004",
		docA: `CONSULTING AGREEMENT — Client A

1. Fees. Fixed fee of $10,000 per month, payable Net 15.

2. Indemnification. Consultant indemnifies Client for third-party IP infringement claims.

3. Data Processing. Consultant may use subprocessors without prior approval.`,
		docB: `CONSULTING AGREEMENT — Client B

1. Fees. Time and materials at $250/hour, payable Net 45 upon milestone acceptance.

2. Indemnification. Mutual indemnification limited to gross negligence and willful misconduct.

3. Data Processing. Subprocessors require Client's prior written consent.`,
		ground_truth_conflicts: [
			{
				category: "payment_structure",
				clause_a_excerpt: "Fixed fee of $10,000 per month, payable Net 15",
				clause_b_excerpt: "Time and materials at $250/hour, payable Net 45",
				description: "Fixed monthly Net 15 vs T&M Net 45 milestone billing",
			},
			{
				category: "indemnification",
				clause_a_excerpt: "Consultant indemnifies Client for third-party IP",
				clause_b_excerpt: "Mutual indemnification limited to gross negligence",
				description: "One-way IP indemnity vs mutual limited indemnity",
			},
			{
				category: "subprocessors",
				clause_a_excerpt: "subprocessors without prior approval",
				clause_b_excerpt: "prior written consent",
				description: "Open subprocessors vs consent required",
			},
		],
	},
	{
		id: "pair_005",
		docA: `LONG FORM MSA — Extended Draft (Party A)

1. Payment. Net 30 from invoice date.

2. Warranty. Services conform to SOW for 90 days.

3. Insurance. Vendor maintains $1M general liability.`,
		docB: `LONG FORM MSA — Extended Draft (Party B)

1. Payment. Net 60 from invoice date.

2. Warranty. Services conform to SOW for 30 days.

3. Insurance. Vendor maintains $2M general liability and cyber liability.`,
		ground_truth_conflicts: [
			{
				category: "payment_timeline",
				clause_a_excerpt: "Net 30 from invoice",
				clause_b_excerpt: "Net 60 from invoice",
				description: "Net 30 vs Net 60 payment terms",
			},
			{
				category: "warranty_period",
				clause_a_excerpt: "conform to SOW for 90 days",
				clause_b_excerpt: "conform to SOW for 30 days",
				description: "90-day vs 30-day warranty period",
			},
			{
				category: "insurance",
				clause_a_excerpt: "$1M general liability",
				clause_b_excerpt: "$2M general liability and cyber",
				description: "Different insurance limits and cyber requirement",
			},
		],
	},
]

// Pad pair_005 with many extra aligned sections to exceed legacy 20-clause / context stuffing limits
function padLongContract(base: string, party: "A" | "B", count: number): string {
	let extra = base + "\n\n"
	for (let i = 4; i <= count; i++) {
		extra += `${i}. Operational Schedule ${i}. Parties will hold a quarterly business review and share metrics within ${party === "A" ? "10" : "20"} business days after quarter end. This section describes reporting cadence item ${i} for capacity planning and resource allocation across regions.\n\n`
	}
	return extra
}

PAIRS[4]!.docA = padLongContract(PAIRS[4]!.docA, "A", 35)
PAIRS[4]!.docB = padLongContract(PAIRS[4]!.docB, "B", 35)

function main() {
	for (const pair of PAIRS) {
		const dir = join(REPO_ROOT, "eval", "dataset", pair.id)
		mkdirSync(dir, { recursive: true })

		const docAPath = join(dir, "doc_a.pdf")
		const docBPath = join(dir, "doc_b.pdf")
		writeFileSync(docAPath, textToPdfBuffer(pair.docA))
		writeFileSync(docBPath, textToPdfBuffer(pair.docB))

		const manifest = {
			id: pair.id,
			doc_a_path: `eval/dataset/${pair.id}/doc_a.pdf`,
			doc_b_path: `eval/dataset/${pair.id}/doc_b.pdf`,
			ground_truth_conflicts: pair.ground_truth_conflicts,
		}
		writeFileSync(
			join(dir, "manifest.json"),
			JSON.stringify(manifest, null, 2) + "\n",
		)
		console.log(`Wrote ${pair.id}`)
	}

	console.log("Done.")
}

if (import.meta.main) {
	main()
}
