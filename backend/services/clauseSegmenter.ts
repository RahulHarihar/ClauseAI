/**
 * Clause-level segmentation using structural signals (not fixed token windows).
 *
 * Heuristics (in order):
 * 1. Split on lines that look like new sections: "1.", "1.1", "Section 1", ALL-CAPS headers, "(a)" enumerations.
 * 2. Merge very short fragments into the previous block.
 * 3. Drop blocks shorter than minClauseLength (noise / page headers).
 *
 * Known failure modes:
 * - Unnumbered prose contracts (letter-style MSAs) may become one or few large chunks.
 * - PDF extraction may break mid-sentence, producing odd boundaries.
 * - Cross-references ("as defined in Section 4.2") are not resolved; each chunk stands alone.
 */

const SECTION_START =
	/^(?:\d+(?:\.\d+)*\.?\s+|\([a-z]\)\s|\([0-9]+\)\s|Section\s+\d+|ARTICLE\s+[IVXLC]+\.?|ARTICLE\s+\d+)/i

const ALL_CAPS_HEADER = /^[A-Z0-9][A-Z0-9\s\-\/]{4,}$/

export type SegmentOptions = {
	minClauseLength?: number
}

export function segmentClauses(
	text: string,
	options?: SegmentOptions,
): string[] {
	const minLen = options?.minClauseLength ?? 40
	const normalized = text.replace(/\r\n/g, "\n").trim()
	if (!normalized) return []

	const lines = normalized.split("\n")
	const blocks: string[] = []
	let current = ""

	const flush = () => {
		const trimmed = current.trim()
		if (trimmed.length >= minLen) {
			blocks.push(trimmed)
		}
		current = ""
	}

	for (const line of lines) {
		const trimmedLine = line.trim()
		if (!trimmedLine) {
			if (current.length > 0) current += "\n"
			continue
		}

		const isNewSection =
			SECTION_START.test(trimmedLine) || ALL_CAPS_HEADER.test(trimmedLine)

		if (isNewSection && current.trim().length >= minLen) {
			flush()
		}

		current += (current ? "\n" : "") + trimmedLine
	}

	flush()

	if (blocks.length === 0 && normalized.length >= minLen) {
		return [normalized]
	}

	return blocks
}
