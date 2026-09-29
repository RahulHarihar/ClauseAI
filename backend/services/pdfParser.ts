import { PDFParse } from "pdf-parse";
import { segmentClauses } from "./clauseSegmenter";

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
	const parser = new PDFParse({ data: buffer });
	const data = await parser.getText();
	return data.text;
}

/** @deprecated Prefer segmentClauses from clauseSegmenter. Kept for compatibility. */
export function extractClauses(text: string): string[] {
	return segmentClauses(text).slice(0, 20);
}
