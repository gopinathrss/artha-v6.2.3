import OpenAI from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import type { AIMemory } from '@prisma/client'
import { getPrisma, realPrisma } from './prisma'
import { getPatternsByTags } from './patterns/loader'
import { projectFutureValue, calculateRequiredSIP } from './calculations'
import { findBestAlternative, loadAllLibrary, scoreInstrument } from './instrumentLibrary'
import { getBestNREFDRate, getRbiRepoRate } from './indiaIntelligence'
import { num } from './money'
import { ensureRowType } from './allocationRowTypes'
import { readPlanAllocationsOrEmpty } from './planAllocationsRead'
import { getSecret } from './secrets'
import { envAnthropicApiKey, envAnthropicModel, envOpenaiApiKey } from './integrations/env-fallback'
import type { BuyRow, SellRow } from './allocationRowTypes'

async function logAiSystemHealth(opts: {
  checkName: string
  status: string
  message?: string
  metadata?: object
}) {
  try {
    const prisma = await getPrisma()
    await prisma.systemHealth.create({
      data: {
        checkName: opts.checkName,
        status: opts.status,
        message: opts.message ?? null,
        metadata: opts.metadata
      }
    })
  } catch {
    // logging must not break ask flow
  }
}

async function maybeNotifyAiDegraded() {
  try {
    const { notifyAiDegradedIfNeeded } = await import('./telegram/bot')
    await notifyAiDegradedIfNeeded()
  } catch {
    // ignore
  }
}

function calculateBlendedReturn(portfolio: any, riskProfile?: string): number {
  const a = portfolio?.allocation
  if (!a) return 8
  const rp = (riskProfile || 'MODERATE').toUpperCase()
  const eqW = rp === 'AGGRESSIVE' ? 14 : rp === 'CONSERVATIVE' ? 11 : 13
  const bdW = rp === 'AGGRESSIVE' ? 7 : rp === 'CONSERVATIVE' ? 6 : 6.5
  const caW = rp === 'AGGRESSIVE' ? 4.5 : rp === 'CONSERVATIVE' ? 5.5 : 5
  return (a.equityPct / 100) * eqW + (a.bondsPct / 100) * bdW + (a.cashPct / 100) * caW
}

async function buildExecutionHistoryAppendix(): Promise<string> {
  const prisma = await getPrisma()
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

  const recentPlans = await prisma.allocationPlan.findMany({
    where: { generatedAt: { gte: sixMonthsAgo } },
    orderBy: { generatedAt: 'desc' }
  })

  let totalRecommended = 0
  let totalExecuted = 0
  let totalSkipped = 0
  const skipsByFund: Record<string, number> = {}
  const recentSkips: Array<{ date: string; fund: string; amount: number; reason: string }> = []

  for (const plan of recentPlans) {
    const rawRows = await readPlanAllocationsOrEmpty(plan)
    for (const raw of rawRows) {
      const row = ensureRowType(raw)
      if (row.type === 'HOLD') continue
      if (row.type !== 'BUY' && row.type !== 'SELL') continue
      const amt = Number(row.amountCzk) || 0
      totalRecommended += amt
      const st = (row.executionStatus || 'PENDING').toUpperCase()
      if (st === 'DONE') {
        totalExecuted += Number(row.executedAmountCzk ?? row.amountCzk) || 0
      } else if (st === 'SKIPPED') {
        totalSkipped += amt
        const fundKey =
          row.type === 'BUY'
            ? String((row as BuyRow).destination || (row as BuyRow).isin || 'unknown')
            : String((row as SellRow).source || (row as SellRow).isin || 'unknown')
        skipsByFund[fundKey] = (skipsByFund[fundKey] ?? 0) + 1
        if (recentSkips.length < 5) {
          recentSkips.push({
            date: plan.generatedAt.toISOString().slice(0, 10),
            fund: fundKey,
            amount: amt,
            reason: String((row as { skipReason?: string }).skipReason || 'no reason given')
          })
        }
      }
    }
  }

  const adherencePct =
    totalRecommended > 0 ? Math.round((totalExecuted / totalRecommended) * 100) : null

  const patterns: string[] = []
  for (const [fund, count] of Object.entries(skipsByFund)) {
    if (count >= 3) {
      patterns.push(
        `User has skipped recommendations for ${fund} ${count} times in 6 months. Consider whether this fund still fits.`
      )
    }
  }
  if (adherencePct !== null && adherencePct < 60) {
    patterns.push(
      `Low adherence (${adherencePct}%). User consistently invests less than recommended. Plans may be too aggressive or expenses underestimated.`
    )
  }

  return `
  RECENT EXECUTION HISTORY (rolling 6 months):
    Total recommended: ${totalRecommended.toFixed(0)} CZK across ${recentPlans.length} plans
    Executed: ${totalExecuted.toFixed(0)} CZK (${adherencePct ?? 'n/a'}% adherence)
    Skipped: ${totalSkipped.toFixed(0)} CZK
    Recent skips:
${recentSkips.map((s) => `    - ${s.date}: ${s.fund} ${s.amount.toFixed(0)} CZK — "${s.reason}"`).join('\n') || '    (none)'}
${patterns.length > 0 ? '\n   PATTERN DETECTED:\n' + patterns.map((p) => `    * ${p}`).join('\n') : ''}
  `
}

function formatXirrForAiPrompt(x: Record<string, unknown> | null | undefined): string {
  if (!x) return 'IRR: context unavailable.'
  const st = String(x.displayState || '')
  if (st === 'OK' && x.displayValue != null && Number.isFinite(Number(x.displayValue))) {
    return `IRR (12+ mo cashflow, money-weighted): ${Number(x.displayValue).toFixed(2)}%.`
  }
  if (st === 'INSUFFICIENT_HISTORY') {
    return `IRR: not yet available — need ${Number(x.minMonthsForDisplay ?? 12)} months of cashflow history (${Number(x.monthsOfHistory ?? 0)} months recorded).`
  }
  if (st === 'ESTIMATE_HIDDEN') {
    return 'IRR: headline hidden — short-horizon proxy not shown (unstable vs a full-year money-weighted rate).'
  }
  return 'IRR: not available for this prompt context.'
}

export function classifyQueryTags(query: string): string[] {
  const tags: string[] = []
  const q = query.toLowerCase()
  if (/\b(allocate|allocation|target|equity|bond|bonds|cash|drift)\b/.test(q)) tags.push('allocation')
  if (/\b(tax|3.year|tax.free|capital.gain|gains)\b/.test(q)) tags.push('tax')
  if (/\b(rebalance|sell|exit|drift)\b/.test(q)) tags.push('rebalance')
  if (/\b(sip|systematic|monthly|invest|recurring)\b/.test(q)) tags.push('sip')
  if (/\b(india|nre|nro|amfi|rbi|fd)\b/.test(q)) tags.push('india')
  if (/\b(czech|cz|erste|george)\b/.test(q)) tags.push('czech')
  if (/\b(should|skip|miss|behavior)\b/.test(q)) tags.push('behavioral')
  if (tags.length === 0) tags.push('allocation', 'behavioral')
  return [...new Set(tags)]
}

export async function buildFullContext(
  portfolio: any,
  library: any[],
  india: { rbi: number; rbiVerifiedDays: number; best1yr: number; dtaa: any },
  opts?: { userQuery?: string }
): Promise<string> {
  const nw = portfolio?.netWorth || {}
  const parts = [
    `NetWorth CZK: ${nw.totalCzk}. EUR equiv: ${nw.totalEur}.`,
    `Czech funds: ${nw.czechFundsCzk}. India total: ${nw.indiaTotal}.`,
    `${formatXirrForAiPrompt(portfolio?.xirr)} InflowWeightedGain: ${nw.inflowWeightedGainPct ?? 'n/a'}% (Czech fund NAV excl. exited minus net holding cashflows, over those inflows; not a time-weighted return).`,
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
  const base = parts.join(' ') + libS
  const baseTrimmed = base.length > 2800 ? base.slice(0, 2800) + '...' : base
  const exec = await buildExecutionHistoryAppendix()

  let wisdom = ''
  const userQuery = opts?.userQuery?.trim()
  if (userQuery) {
    const patternTags = classifyQueryTags(userQuery)
    const patterns = getPatternsByTags(patternTags, 5)
    const patternsSection =
      patterns.length > 0
        ? `\n\nRELEVANT PRINCIPLES (cite by id when applicable):\n` +
          patterns
            .map((p) => {
              const oneLine = p.principle.replace(/\s+/g, ' ').trim().slice(0, 200)
              return `- [${p.id}] ${p.title}: ${oneLine}`
            })
            .join('\n')
        : ''

    const prisma = await getPrisma()
    const recentOutcomes = await prisma.recommendationOutcome.findMany({
      where: { status: 'EXECUTED_90D' },
      orderBy: { evaluatedAt90d: 'desc' },
      take: 10
    })
    const outcomesSection =
      recentOutcomes.length > 0
        ? `\n\nRECENT 90-DAY OUTCOMES (real performance):\n` +
          recentOutcomes
            .map((o) => {
              const amt = Number(o.recommendedAmountCzk)
              const g =
                o.gainPctAt90d != null && Number.isFinite(Number(o.gainPctAt90d))
                  ? `${Number(o.gainPctAt90d).toFixed(1)}% 90d gain`
                  : 'no measurement'
              const ex = o.wasExecuted === true ? 'executed' : o.wasExecuted === false ? 'skipped' : 'unknown'
              return `- ${o.fundName} ${o.rowType} ${amt.toFixed(0)} CZK: ${ex}, ${g}`
            })
            .join('\n')
        : ''

    wisdom = patternsSection + outcomesSection

    const { getMergedSettings } = await import('./appSettingsMerge')
    const dbg =
      (await getMergedSettings(realPrisma).catch(() => null))?.aiDebugLogging ||
      process.env.PIE_DEBUG_AI_CONTEXT === '1' || process.env.ARTHA_DEBUG_AI_CONTEXT === '1'
    if (dbg) {
      console.log('[buildFullContext] wisdom appendix:', wisdom.slice(0, 2000))
    }
  }

  return baseTrimmed + exec + wisdom
}

function detectQuestionType(q: string): string {
  const t = q.toLowerCase()
  if (t.includes('month') || t.includes('this month') || t.includes('should i do')) return 'MONTHLY_ACTION'
  if (t.includes('retire') || t.includes('50')) return 'RETIREMENT'
  if (t.includes('flat') || t.includes('property') || t.includes('buy a')) return 'PROPERTY'
  if (t.includes('fee') || t.includes('leak') || t.includes('cost')) return 'FEES'
  return 'GENERAL'
}

export async function analyzeRetirement(portfolio: any) {
  const prisma = await getPrisma()
  const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
  const { getMergedSettings } = await import('./appSettingsMerge')
  const merged = await getMergedSettings(realPrisma)
  const dob = profile?.dateOfBirth ? new Date(profile.dateOfBirth as Date) : null
  const currentAge = dob
    ? Math.max(18, Math.floor((Date.now() - dob.getTime()) / (365.25 * 86400000)))
    : 35
  const targetAge = profile?.retirementAge ?? 60
  const yearsLeft = Math.max(1, targetAge - currentAge)
  const blended = calculateBlendedReturn(portfolio, merged.riskProfile)
  const total = portfolio?.netWorth?.totalCzk ?? 0
  const sipFromHoldings = Array.isArray(portfolio?.holdings)
    ? (portfolio.holdings as { monthlySipCzk?: unknown }[]).reduce((s, h) => {
        const v = h?.monthlySipCzk
        return s + (typeof v === 'number' || typeof v === 'string' ? num(v as never) : 0)
      }, 0)
    : 0
  const sip =
    sipFromHoldings > 0
      ? sipFromHoldings
      : Math.max(0, num(profile?.monthlyNetIncomeCzk) * 0.25 || num(profile?.retirementMonthlyExpense) * 0.5)
  const projected = projectFutureValue(total, blended, yearsLeft, sip)
  const monthlyPassive = (projected * 0.04) / 12
  const expenses = num(profile?.retirementMonthlyExpense) || num(profile?.monthlyNetIncomeCzk) * 0.5 || 0
  return {
    currentNetWorthCzk: total,
    yearsToRetirement: yearsLeft,
    projectedAtRetirement: projected,
    monthlyPassiveIncome: Math.round(monthlyPassive),
    currentMonthlyExpenses: Math.round(expenses),
    isOnTrack: expenses > 0 ? monthlyPassive >= expenses : false,
    shortfallCzk: expenses > 0 ? Math.max(0, expenses - monthlyPassive) * 12 * 20 : 0,
    requiredSIP: calculateRequiredSIP(total, projected * 1.5, blended, yearsLeft)
  }
}

export async function analyzeProperty(portfolio: any) {
  const prisma = await getPrisma()
  const profile = await prisma.userProfile.findUnique({ where: { id: 'default' } })
  const { getMergedSettings } = await import('./appSettingsMerge')
  const merged = await getMergedSettings(realPrisma)
  const propertyPriceCzk =
    merged.targetWealthCzk != null && merged.targetWealthCzk > 0
      ? merged.targetWealthCzk
      : Math.max(3_000_000, num(profile?.monthlyNetIncomeCzk) * 120)
  const downPaymentPct = 0.2
  const downPaymentNeeded = propertyPriceCzk * downPaymentPct
  const nw = portfolio?.netWorth || {}
  const liquidSavings = num(nw.czechSavingsCzk || 0) + num(nw.czechPensionCzk || 0)
  const monthlyTowardDown = Math.max(5000, num(profile?.monthlyNetIncomeCzk) * 0.2)
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

function stripAiJsonFences(raw: string): string {
  let s = raw.trim()
  const fenced = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/i.exec(s)
  if (fenced) return fenced[1].trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```[a-z0-9_-]*\s*\r?\n?/i, '')
    s = s.replace(/\r?\n?```\s*$/i, '')
  }
  return s.trim()
}

function extractBalancedJson(s: string): string | null {
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const c = s[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function parseAIResponse(text: string | null | undefined): {
  answer: string
  keyNumbers: any[]
  topAction: string
  confidence: number
  followUp: string[]
} {
  const fallback = (msg: string) => ({
    answer: msg,
    keyNumbers: [] as any[],
    topAction: 'Review allocation and next tax event.',
    confidence: 65,
    followUp: [] as string[]
  })
  if (!text) {
    return { answer: 'No content', keyNumbers: [], topAction: '', confidence: 0, followUp: [] }
  }
  const cleaned = stripAiJsonFences(text)
  let j: Record<string, unknown>
  try {
    j = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    const sub = extractBalancedJson(cleaned)
    if (!sub) return fallback(text)
    try {
      j = JSON.parse(sub) as Record<string, unknown>
    } catch {
      return fallback(text)
    }
  }
  const pickAnswer = (): string => {
    const a = j.answer ?? j.response ?? j.content ?? j.summary ?? j.message
    if (typeof a === 'string') return a
    if (Array.isArray(a) && a.every((x) => typeof x === 'string')) return (a as string[]).join('\n')
    if (a != null && typeof a === 'object') return JSON.stringify(a)
    return typeof text === 'string' ? text : ''
  }
  const answerStr = pickAnswer().trim() || 'No structured answer returned.'
  const kn = j.keyNumbers
  const fu = j.followUp
  return {
    answer: answerStr,
    keyNumbers: Array.isArray(kn) ? kn : [],
    topAction: typeof j.topAction === 'string' ? j.topAction : '',
    confidence: Math.min(100, Math.max(0, Number(j.confidence) || 70)),
    followUp: Array.isArray(fu) ? fu.filter((x): x is string => typeof x === 'string') : []
  }
}

export type AskKeys = { anthropicKey?: string; openaiKey?: string }

export async function askPie(question: string, portfolio: any, keys?: AskKeys): Promise<AIMemory> {
  const prisma = await getPrisma()
  const library = await loadAllLibrary()
  const rbiInfo = getRbiRepoRate()
  const rbi = rbiInfo.value
  const best1 = num((await getBestNREFDRate('1yr'))?.value ?? 7.1)
  const dtaa = { note: '15% NRO WHT under India–Czech Republic DTAA vs 30% default' }
  const type = detectQuestionType(question)
  const context = await buildFullContext(
    { ...portfolio, aiHints: await lastMemories(3) },
    library,
    { rbi, rbiVerifiedDays: rbiInfo.ageInDays, best1yr: best1, dtaa },
    { userQuery: question }
  )
  let pre: any = {}
  if (type === 'RETIREMENT') pre = await analyzeRetirement(portfolio)
  if (type === 'PROPERTY') pre = await analyzeProperty(portfolio)
  if (type === 'FEES') pre = await analyzeFees(portfolio)
  if (type === 'MONTHLY_ACTION') pre = analyzeMonthlyAction(portfolio)

  const systemPrompt = `You are PIE (Personal Investment Engine), a personal CFO and financial intelligence system
for an Indian professional living in Czech Republic.
CRITICAL RULES:
- Every number you must derive from the context and pre-computed analysis only
- Be specific. Max 4 short paragraphs. JSON output only, no markdown.
When advising, you MUST:
- Cite the most relevant principle by [P-XXX] id when it directly supports your reasoning. Example: "Per [P-014], Czech 3-year tax rule means selling Sporobond now would cost 15% on gains."
- Reference past outcomes when relevant. Example: "Last quarter you skipped 2 of 3 rebalance sells; the unsold positions averaged +2% while the sold one averaged -1%, so your skip pattern paid off this time. But this was tactical luck, not strategy."
- Be honest when no pattern applies — don't force citations.
- Never invent principle IDs.`

  const userPrompt = `PORTFOLIO CONTEXT:\n${context}\n\nPRE-COMPUTED:\n${JSON.stringify(pre)}\n\nQUESTION: ${question}\n\nRespond as raw JSON: {"answer":"","keyNumbers":[],"topAction":"","confidence":70,"followUp":[]}`

  const noKeyMsg =
    'Configure an enabled AI provider under Integrations (or set legacy OPENAI_API_KEY / ANTHROPIC_API_KEY once for bootstrap).'

  let textOut: string | undefined
  try {
    const { bootstrapIntegrationsFromEnvIfNeeded } = await import('./integrations/store')
    await bootstrapIntegrationsFromEnvIfNeeded()
    const { aiRouterAsk } = await import('./integrations/ai/router')
    const out = await aiRouterAsk({
      system: systemPrompt + '\nRespond as raw JSON only.',
      user: userPrompt,
      max_tokens: 800,
      temperature: 0.3
    })
    textOut = out.text
    await logAiSystemHealth({
      checkName: 'AI_CALL_SUCCESS',
      status: 'PASS',
      message: `${out.provider} OK`,
      metadata: { provider: out.provider, model: out.model, inputTokens: out.inputTokens, outputTokens: out.outputTokens }
    })
  } catch {
    /* fall through to legacy keys */
  }

  const anthropicKey = (keys?.anthropicKey || envAnthropicApiKey()).trim()
  let openaiKey = (keys?.openaiKey || envOpenaiApiKey()).trim()
  try {
    const sk = await getSecret('openaiApiKey')
    if (sk) openaiKey = sk.trim()
  } catch {
    /* plaintext blocked */
  }

  if (!textOut && !anthropicKey && !openaiKey) {
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

  const modelClaude = envAnthropicModel()
  const modelOpenAI = 'gpt-4o'

  if (!textOut && anthropicKey) {
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
      const u = msg.usage
      await logAiSystemHealth({
        checkName: 'AI_CALL_SUCCESS',
        status: 'PASS',
        message: `Anthropic OK, ${u?.input_tokens ?? 0} in / ${u?.output_tokens ?? 0} out`,
        metadata: {
          provider: 'anthropic',
          model: msg.model,
          inputTokens: u?.input_tokens,
          outputTokens: u?.output_tokens,
          stopReason: msg.stop_reason
        }
      })
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string; status?: number }
      textOut = undefined
      await logAiSystemHealth({
        checkName: 'AI_CALL_FAILURE',
        status: 'FAIL',
        message: `Anthropic call failed: ${err?.message ?? String(e)}`,
        metadata: {
          provider: 'anthropic',
          errorType: err?.name,
          errorCode: err?.status ?? null,
          errorMessage: err?.message,
          prompt_first_200: userPrompt.slice(0, 200)
        }
      })
      await maybeNotifyAiDegraded()
    }
  }

  if (!textOut && openaiKey) {
    try {
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
      const u = res.usage
      await logAiSystemHealth({
        checkName: 'AI_CALL_SUCCESS',
        status: 'PASS',
        message: `OpenAI OK, ${u?.prompt_tokens ?? 0} in / ${u?.completion_tokens ?? 0} out`,
        metadata: {
          provider: 'openai',
          model: res.model,
          inputTokens: u?.prompt_tokens,
          outputTokens: u?.completion_tokens
        }
      })
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string; status?: number }
      textOut = undefined
      await logAiSystemHealth({
        checkName: 'AI_CALL_FAILURE',
        status: 'FAIL',
        message: `OpenAI call failed: ${err?.message ?? String(e)}`,
        metadata: {
          provider: 'openai',
          errorType: err?.name,
          errorCode: err?.status ?? null,
          errorMessage: err?.message,
          prompt_first_200: userPrompt.slice(0, 200)
        }
      })
      await maybeNotifyAiDegraded()
    }
  }

  if (!textOut) {
    return prisma.aIMemory.create({
      data: {
        questionAsked: question,
        questionType: type,
        portfolioSnapshot: portfolio as any,
        aiResponse:
          'AI call failed. Check Integrations AI providers, legacy API keys, network, and model availability.',
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

/** @deprecated Use {@link askPie} */
export const askArtha = askPie

export async function lastMemories(n: number) {
  const prisma = await getPrisma()
  return prisma.aIMemory.findMany({ orderBy: { createdAt: 'desc' }, take: n })
}
