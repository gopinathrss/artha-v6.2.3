declare module 'mailparser' {
  export interface ParsedMail {
    from?: { text?: string }
    subject?: string
    date?: Date
    text?: string
    html?: string | { toString(): string }
    messageId?: string
  }
  export function simpleParser(source: Buffer | string): Promise<ParsedMail>
}

declare module 'pdf-parse' {
  function pdfParse(data: Buffer): Promise<{ text: string }>
  export default pdfParse
}
