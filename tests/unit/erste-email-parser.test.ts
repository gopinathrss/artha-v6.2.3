import { describe, expect, it } from 'vitest'
import { parseErsteSipEmail } from '../../src/lib/ingestion/parsers/erste'

describe('parseErsteSipEmail', () => {
  it('parses Czech-style Erste SIP body', () => {
    const body = `
Dobrý den,
Investice do fondu CZ0008472263 – Sporobond
Částka: 2 000,00 CZK
Datum: 14.05.2026
Česká spořitelna
`
    const r = parseErsteSipEmail('Potvrzení investice', body)
    expect(r.parsedType).toBe('ERSTE_SIP_CONFIRM')
    expect(r.fundIsin).toBe('CZ0008472263')
    expect(r.amount?.toString()).toBe('2000')
    expect(r.fundName).toBe('Sporobond')
    expect(r.confidence).toBeGreaterThanOrEqual(70)
  })

  it('returns UNKNOWN for non-Erste email', () => {
    const r = parseErsteSipEmail('Amazon order', 'Your package was delivered.')
    expect(r.parsedType).toBe('UNKNOWN')
    expect(r.confidence).toBe(0)
  })

  it('handles ISIN without amount', () => {
    const body = 'Erste notification about fund CZ0008472230 Corporate Bonds pending.'
    const r = parseErsteSipEmail('Info', body)
    expect(r.parsedType).toBe('ERSTE_SIP_CONFIRM')
    expect(r.fundIsin).toBeTruthy()
    expect(r.amount).toBeNull()
    expect(r.confidence).toBeLessThan(70)
  })

  it('extracts AT ISIN', () => {
    const body = 'Investice AT0000A10QN3 Emerging Markets částka 1 500,00 CZK dne 01.04.2026'
    const r = parseErsteSipEmail('George', body)
    expect(r.fundIsin).toBe('AT0000A10QN3')
    expect(r.amount?.toString()).toBe('1500')
  })

  it('caps confidence at 100', () => {
    const body =
      'Česká spořitelna CZ0008472263 Sporobond 9 999,99 CZK 01.01.2026 02.01.2026 GLOBAL STOCKS FF Sporobond'
    const r = parseErsteSipEmail('x', body)
    expect(r.confidence).toBeLessThanOrEqual(100)
  })
})
