import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { AIMemory } from '@prisma/client'
import { prisma } from './prisma'
import { projectFutureValue, calculateRequiredSIP } from './calculations'
import { findBestAlternative, loadAllLibrary, scoreInstrument } from './instrumentLibrary'
import { getBestNREFDRate, getRbiRepoRate } from './indiaIntelligence'
import { num } from './money'
import { ensureRowType } from './allocationRowTypes'
import type { BuyRow, ReserveRow, SellRow } from './allocationRowTypes'

function calculateBlendedReturn(portfolio: any): number {
  const a = portfolio?.allocation
  if (!a) return 8
  return (a.equityPct / 100) * 13 + (a.bondsPct / 100) * 6.5 + (a.cashPct / 100) * 5
}

async function buildExecutionHistoryAppendix(): Promise<string> {
  const plans = await prisma.allocationPlan.findMany({ orderBy: { generatedAt: 'desc' }, take: 4 })
  if (plans.length < 2) return ''
  const prev = plans[1]
  const rawRows = Array.isArray(prev.allocations) ? (prev.allocations as unknown[]) : []
  const rows = rawRows.map(ensureRowType).filter((r) => r.type !== 'HOLD')
  let recommended = 0
  let executed = 0
  let skippedAmt = 0
  let doneN = 0
  const skipLines: string[] = []
  for (const r of rows) {
    recommended += Number(r.amountCzk) || 0
    const st = (r.executionStatus || 'PENDING').toUpperCase()
    if (st === 'DONE') {
      doneN += 1
      executed += Number(r.executedAmountCzk ?? r.amountCzk) || 0
    } else if (st === 'SKIPPED') {
      skippedAmt += Number(r.amountCzk) || 0
      const label =
        r.type === 'SELL'
          ? `Sell from ${(r as SellRow).source}`
          : r.type === 'RESERVE'
            ? `Reserve ${(r as ReserveRow).destination}`
            : `To ${(r as BuyRow).destination || (r as BuyRow).isin || 'destination'}`
      skipLines.push(`- ${label}: "${String(r.skipReason || '').slice(0, 120)}"`)
    }
  }
  const closable = rows.filter((r) => ['DONE', 'SKIPPED'].includes((r.executionStatus || '').toUpperCase())).length
  const adherencePct = closable > 0 ? Math.round((doneN / closable) * 1000) / 10 : 0
  const header = `RECENT EXECUTION HISTORY: Prior plan ${prev.monthYear}: recommended ~${Math.round(recommended)} CZK across ${rows.length} actionable rows; executed ~${Math.round(executed)} CZK (${doneN} done); skipped ~${Math.round(skippedAmt)} CZK.`
  const skips = skipLines.length ? ` Skip reasons: ${skipLines.join(' ')}` : ''
  const adherence = ` Adherence (done vs done+skipped on that plan): ${adherencePct}%.`

  const subtypeCounts = new Map<string, number>()
  for (const p of plans) {
    const arr = Array.isArray(p.allocations) ? (p.allocations as unknown[]) : []
    for (const raw of arr) {
      const r = ensureRowType(raw)
      if ((r.executionStatus || '').toUpperCase() !== 'SKIPPED') continue
      const rec = r as unknown as Record<string, unknown>
      const key =
        r.type === 'SELL' && (r as SellRow).sellSubtype
          ? String((r as SellRow).sellSubtype)
          : typeof rec.isin === 'string' && rec.isin
            ? `ISIN:${rec.isin}`
            : 'OTHER'
      subtypeCounts.set(key, (subtypeCounts.get(key) || 0) + 1)
    }
  }
  const patterns = [...subtypeCounts.entries()]
    .filter(([, v]) => v >= 2)
    .map(
      ([k, v]) =>
        `PATTERN DETECTED: Skips involving "${k}" appeared in ${v} recent plan(s). Consider whether advice thresholds match user preference.`
    )
  const patS = patterns.length ? ` ${patterns.join(' ')}` : ''
  return ` ${header}${skips}${adherence}${patS}`
}

export async function buildFullContext(
  portfolio: any,
  library: any[],
  india: { rbi: number; rbiVerifiedDays: number; best1yr: number; dtaa: any }
): Promise<string> {
  const nw = portfolio?.netWorth || {}
  const parts = [
    `NetWorth CZK: ${nw.totalCzk}. EUR equiv: ${nw.totalEur}.`,
    `Czech funds: ${nw.czechFundsCzk}. India total: ${nw.indiaTotal}.`,
    `XIRR: ${JSON.stringify(portfolio?.xirr || {})}.`,
    `Allocation: ${JSON.stringify(portfolio?.allocation || {})}.`,
    `RBI repo rate: ${Number(india.rbi).toFixed(2)}% (verified ${india.rbiVerifiedDays}d ago). Best NRE 1yr: ${india.best1yr}%.`,
    `DTAA: ${JSON.stringify(india.dtaa)}.`,
    `Tax / holdings (first 6): ${JSON.stringify((portfolio?.holdings || []).slice(0, 6))}.`,
    `Tax calendar (first 5): ${JSON.stringify((portfolio?.taxCalendar || []).slice(0, 5))}.`,
    `Last recommendations: ${JSON.stringify(portfolio?.aiHints || [])}.`
  ]
  const libS = `Library top by category: ${JSON.stringify(
    library.slice(0, 8).map((l) => ({ isin: l.isin, name: l.name, s: l.score, ter: l.terPct }))
  )}.`
  const exec = await buildExecutionHistoryAppendix()
  const s = parts.join(' ') + libS + exec
  return s.length > 3200 ? s.slice(0, 3200) + '...' : s
}

function detectQuestionType(q: string): string {
  const t = q.toLowerCase()
  if (t.includes('month') || t.includes('this month') || t.includes('should i do')) return 'MONTHLY_ACTION'
  if (t.includes('retire') || t.includes('50')) return 'RETIREMENT'
  if (t.includes('flat') || t.includes('property') || t.includes('buy a')) return 'PROPERTY'
  if (t.includes('fee') || t.includes('leak') || t.includes('cost')) return 'FEES'
  return 'GENERAL'
}

export function analyzeRetirement(portfolio: any) {
  const currentAge = 31
  const targetAge = 50
  const yearsLeft = targetAge - currentAge
  const blended = calculateBlendedReturn(portfolio)
  const total = portfolio?.netWorth?.totalCzk ?? 0
  const sip = Array.isArray(portfolio?.holdings)
    ? (portfolio.holdings as any[]).reduce((s, h) => s + num(h?.monthlySipCzk || 0), 0) || 32000
    : 32000
  const projected = projectFutureValue(total, blended, yearsLeft, sip)
  const monthlyPassive = (projected * 0.04) / 12
  return {
    currentNetWorthCzk: total,
    yearsToRetirement: yearsLeft,
    projectedAtRetirement: projected,
    monthlyPassiveIncome: Math.round(monthlyPassive),
    currentMonthlyExpenses: 32000,
    isOnTrack: monthlyPassive >= 32000,
    shortfallCzk: Math.max(0, 32000 - monthlyPassive) * 12 * 20,
    requiredSIP: calculateRequiredSIP(total, projected * 1.5, blended, yearsLeft)
  }
}

export function analyzeProperty(portfolio: any) {
  const propertyPriceCzk = 5_000_000
  const downPaymentPct = 0.2
  const downPaymentNeeded = propertyPriceCzk * downPaymentPct
  const nw = portfolio?.netWorth || {}
  const liquidSavings = num(nw.czechSavingsCzk || 0) + num(nw.czechPensionCzk || 0)
  const monthlyTowardDown = 15000
  const monthsToDown = Math.max(0, Math.round((downPaymentNeeded - liquidSavings) / monthlyTowardDown))
  const mortgageMonthly = Math.round(((propertyPriceCzk - downPaymentNeeded) * 0.055) / 12)
  return {
    propertyPriceCzk,
    downPaymentNeeded,
    liquidSavings,
    shortfallCzk: Math.max(0, downPaymentNeeded - liquidSavings),
    monthsToDownPayment: monthsToDown,
    mortgageMonthlyPayment: mortgageMonthly,
    opportunityCostCzk: Math.round(downPaymentNeeded * Math.pow(1.1, 10) - downPaymentNeeded),
    recommendation: monthsToDown < 24 ? 'READY_TO_BUY' : monthsToDown < 48 ? 'SAVING' : 'INVEST_FIRST'
  }
}

export async function analyzeFees(portfolio: any) {
  const lib = await loadAllLibrary()
  const holdings = portfolio?.holdings || []
  const out: { holding: string; save: number; alt?: string }[] = []
  for (const h of holdings) {
    if (h.status === 'EXITED') continue
    const alt = findBestAlternative(
      h,
      lib.map((i) => ({ ...i, score: i.score ?? scoreInstrument(i) } as any))
    )
    if (alt) out.push({ holding: h.name, save: alt.annualSavingCzk, alt: alt.instrument.name })
  }
  return { items: out }
}

export function analyzeMonthlyAction(portfolio: any) {
  const list = (portfolio?.taxCalendar || []) as any[]
  const t = list.filter((x) => {
    const d = x?.tax?.daysUntilTaxFree ?? x?.daysLeft
    return d != null && d > 0 && d <= 30
  })
  if (t.length) return { priority: 'TAX', detail: t[0] }
  return { priority: 'REBALANCE', detail: portfolio?.allocation }
}

function parseAIResponse(text: string | null | undefined): {
  answer: string
  keyNumbers: any[]
  topAction: string
  confidence: number
  followUp: string[]
} {
  if (!text) {
    return { answer: 'No content', keyNumbers: [], topAction: '', confidence: 0, followUp: [] }
  }
  try {
    const j = JSON.parse(text)
    return {
      answer: String(j.answer || text),
      keyNumbers: j.keyNumbers || [],
      topAction: j.topAction || '',
      confidence: Math.min(100, Math.max(0, Number(j.confidence) || 70)),
      followUp: Array.isArray(j.followUp) ? j.followUp : []
    }
  } catch {
    return { answer: text, keyNumbers: [], topAction: 'Review allocation and next tax event.', confidence: 65, followUp: [] }
  }
}

export type AskKeys = { anthropicKey: string; openaiKey: string }

export async function askArtha(question: string, portfolio: any, keys: AskKeys): Promise<AIMemory> {
  const { anthropicKey, openaiKey } = keys
  const library = await loadAllLibrary()
  const rbiInfo = getRbiRepoRate()
  const rbi = rbiInfo.value
  const best1 = num((await getBestNREFDRate('1yr'))?.value ?? 7.1)
  const dtaa = { note: '15% NRO WHT under India–Czech Republic DTAA vs 30% default' }
  const type = detectQuestionType(question)
  const context = await buildFullContext(
    { ...portfolio, aiHints: await lastMemories(3) },
    library,
    { rbi, rbiVerifiedDays: rbiInfo.ageInDays, best1yr: best1, dtaa }
  )
  let pre: any = {}
  if (type === 'RETIREMENT') pre = analyzeRetirement(portfolio)
  if (type === 'PROPERTY') pre = analyzeProperty(portfolio)
  if (type === 'FEES') pre = await analyzeFees(portfolio)
  if (type === 'MONTHLY_ACTION') pre = analyzeMonthlyAction(portfolio)

  const systemPrompt = `You are ARTHA, a personal CFO and financial intelligence system
for an Indian professional living in Czech Republic.
CRITICAL RULES:
- Every number you must derive from the context and pre-computed analysis only
- Be specific. Max 4 short paragraphs. JSON output only, no markdown.`

  const userPrompt = `PORTFOLIO CONTEXT:\n${context}\n\nPRE-COMPUTED:\n${JSON.stringify(pre)}\n\nQUESTION: ${question}\n\nRespond as raw JSON: {"answer":"","keyNumbers":[],"topAction":"","confidence":70,"followUp":[]}`

  const noKeyMsg =
    'Set ANTHROPIC_API_KEY (recommended) or OpenAI API key in Settings -> Integrations (or env OPENAI_API_KEY).'
  if (!anthropicKey && !openaiKey) {
    return prisma.aIMemory.create({
      data: {
        questionAsked: question,
        questionType: type,
        portfolioSnapshot: portfolio as any,
        aiResponse: noKeyMsg,
        keyNumbers: [] as any,
        recommendations: {} as any,
        confidenceScore: 0
      }
    })
  }

  const modelClaude = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022'
  const modelOpenAI = 'gpt-4o'

  let textOut: string | undefined
  if (anthropicKey) {
    try {
      const ac = new Anthropic({ apiKey: anthropicKey })
      const msg = await ac.messages.create({
        model: modelClaude,
        max_tokens: 800,
        temperature: 0.3,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
      const b = msg.content[0]
      textOut = b && b.type === 'text' ? b.text : undefined
    } catch {
      textOut = undefined
    }
  }

  if (!textOut && openaiKey) {
    const client = new OpenAI({ apiKey: openaiKey })
    const res = await client.chat.completions.create({
      model: modelOpenAI,
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: systemPrompt + '\nRespond as raw JSON only.' },
        { role: 'user', content: userPrompt }
      ]
    })
    textOut = res.choices[0]?.message?.content ?? undefined
  }

  if (!textOut) {
    return prisma.aIMemory.create({
      data: {
        questionAsked: question,
        questionType: type,
        portfolioSnapshot: portfolio as any,
        aiResponse:
          'AI call failed. Check ANTHROPIC_API_KEY or OpenAI key, network, and model availability. Primary: Claude; fallback: GPT-4o.',
        keyNumbers: [] as any,
        recommendations: {} as any,
        confidenceScore: 0
      }
    })
  }

  const parsed = parseAIResponse(textOut)
  return prisma.aIMemory.create({
    data: {
      questionAsked: question,
      questionType: type,
      portfolioSnapshot: portfolio as any,
      aiResponse: parsed.answer,
      keyNumbers: (parsed.keyNumbers as any) ?? null,
      recommendations: { topAction: parsed.topAction, followUp: parsed.followUp } as any,
      confidenceScore: parsed.confidence
    }
  })
}

export async function lastMemories(n: number) {
  return prisma.aIMemory.findMany({ orderBy: { createdAt: 'desc' }, take: n })
}
