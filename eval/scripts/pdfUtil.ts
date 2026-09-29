/** Minimal text PDF generator for synthetic eval documents. */

function escapePdfText(text: string): string {
	return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")
}

export function textToPdfBuffer(body: string): Buffer {
	const lines = body.replace(/\r\n/g, "\n").split("\n")
	const contentLines: string[] = ["BT", "/F1 11 Tf", "14 TL", "50 750 Td"]
	for (const line of lines) {
		const safe = line.length === 0 ? " " : line
		contentLines.push(`(${escapePdfText(safe)}) '`)
	}
	contentLines.push("ET")
	const stream = contentLines.join("\n")
	const streamLen = Buffer.byteLength(stream, "utf8")

	const objects = [
		"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
		"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
		"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n",
		`4 0 obj\n<< /Length ${streamLen} >>\nstream\n${stream}\nendstream\nendobj\n`,
		"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
	]

	let pdf = "%PDF-1.4\n"
	const offsets: number[] = [0]
	for (const obj of objects) {
		offsets.push(Buffer.byteLength(pdf, "utf8"))
		pdf += obj
	}

	const xrefStart = Buffer.byteLength(pdf, "utf8")
	pdf += `xref\n0 ${objects.length + 1}\n`
	pdf += "0000000000 65535 f \n"
	for (let i = 1; i <= objects.length; i++) {
		pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`
	}
	pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`

	return Buffer.from(pdf, "utf8")
}
