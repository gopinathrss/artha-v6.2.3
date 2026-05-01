import { Decimal } from '@prisma/client/runtime/library'

export interface ParsedErsteSip {
  parsedType: 'ERSTE_SIP_CONFIRM' | 'UNKNOWN'
  amount: Decimal | null
  fundIsin: string | null
  fundName: string | null
  date: Date | null
  confidence: number
}

/**
 * Heuristic parser for Erste / Česká spořitelna SIP confirmation emails.
 */
export function parseErsteSipEmail(subject: string, body: string): ParsedErsteSip {
  const result: ParsedErsteSip = {
    parsedType: 'UNKNOWN',
    amount: null,
    fundIsin: null,
    fundName: null,
    date: null,
    confidence: 0
  }

  const blob = `${subject} ${body}`
  const isErste = /erste|česká spořitelna|cs\.cz|investicnicentrum|george|spořitelna/i.test(blob)
  if (!isErste) return result

  result.parsedType = 'ERSTE_SIP_CONFIRM'
  result.confidence = 25

  const isinMatch = body.match(/\b((?:CZ|AT|IE)[A-Z0-9]{10})\b/)
  if (isinMatch) {
    result.fundIsin = isinMatch[1]
    result.confidence += 25
  }

  const amountMatch = body.match(/(\d[\d\s]*[.,]\d{2})\s*CZK/i)
  if (amountMatch) {
    const cleanAmount = amountMatch[1].replace(/\s/g, '').replace(',', '.')
    const num = parseFloat(cleanAmount)
    if (Number.isFinite(num)) {
      result.amount = new Decimal(num)
      result.confidence += 25
    }
  }

  const dateMatch = body.match(/(\d{2})\.(\d{2})\.(\d{4})/)
  if (dateMatch) {
    const [, day, month, year] = dateMatch
    const date = new Date(`${year}-${month}-${day}T00:00:00.000Z`)
    if (!Number.isNaN(date.getTime())) {
      result.date = date
      result.confidence += 15
    }
  }

  const knownFunds = [
    'Sporobond',
    'Sporoinvest',
    'Dynamic Mix',
    'Conservative Mix',
    'GLOBAL STOCKS FF',
    'Top Stocks',
    'Emerging Markets',
    'Small Caps',
    'Akciový Mix',
    'REICO',
    'Corporate Bonds'
  ]
  for (const name of knownFunds) {
    if (body.includes(name)) {
      result.fundName = name
      result.confidence += 10
      break
    }
  }

  result.confidence = Math.min(100, result.confidence)
  return result
}
