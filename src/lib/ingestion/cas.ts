import * as fs from 'fs'

export async function processCasPdf(filePath: string): Promise<{
  savedTo: string
  extractedTextPreview: string
}> {
  try {
    const pdfParse = await import('pdf-parse')
      .then((m) => m.default)
      .catch(() => null as null)
    if (pdfParse) {
      const buffer = fs.readFileSync(filePath)
      const data = await pdfParse(buffer)
      return {
        savedTo: filePath,
        extractedTextPreview: (data.text || '').slice(0, 2000)
      }
    }
  } catch {
    /* optional dependency */
  }
  return {
    savedTo: filePath,
    extractedTextPreview: 'PDF text extraction skipped (pdf-parse not installed)'
  }
}
