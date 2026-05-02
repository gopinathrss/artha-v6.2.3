import * as fs from 'fs'
import * as path from 'path'

export interface Pattern {
  id: string
  title: string
  principle: string
  tags: string[]
  confidence: number
  sources?: string[]
}

let cache: Pattern[] | null = null

/** Curated `data/patterns/v1.yaml` — line-oriented parser (no external YAML dep). */
function parsePatternsYaml(raw: string): Pattern[] {
  const i = raw.indexOf('patterns:')
  if (i === -1) return []
  const body = raw.slice(i + 'patterns:'.length)
  const chunks = body.split(/\n(?=\s*-\s*id:\s*P-)/g)
  const out: Pattern[] = []
  for (const chunk0 of chunks) {
    const chunk = chunk0.replace(/^\s*-\s*id:\s*/, '').trim()
    if (!chunk.startsWith('P-')) continue
    const lines = chunk.split(/\r?\n/)
    const id = lines[0]?.trim() || ''
    if (!/^P-\d{3}$/.test(id)) continue
    let title = ''
    let principle = ''
    const tags: string[] = []
    let confidence = 0.85
    const sources: string[] = []
    let inPrincipleBlock = false
    const principleLines: string[] = []

    for (let li = 1; li < lines.length; li++) {
      const line = lines[li] ?? ''
      const trimmed = line.trim()
      if (inPrincipleBlock) {
        if (trimmed.startsWith('tags:') || trimmed.startsWith('confidence:') || trimmed.startsWith('sources:')) {
          inPrincipleBlock = false
          principle = principleLines.join('\n').trim()
          li -= 1
          continue
        }
        if (line.startsWith('    ') || line.startsWith('\t')) {
          principleLines.push(line.replace(/^\s{4}/, ''))
        } else if (trimmed === '') {
          principleLines.push('')
        } else {
          inPrincipleBlock = false
          principle = principleLines.join('\n').trim()
          li -= 1
          continue
        }
        continue
      }
      const mTitle = line.match(/^\s*title:\s*"(.*)"\s*$/) || line.match(/^\s*title:\s*'(.*)'\s*$/)
      if (mTitle) {
        title = mTitle[1].replace(/\\"/g, '"')
        continue
      }
      if (/^\s*principle:\s*\|\s*$/.test(line)) {
        inPrincipleBlock = true
        principleLines.length = 0
        continue
      }
      const mPrincipleQ = line.match(/^\s*principle:\s*"((?:\\.|[^"\\])*)"\s*$/)
      if (mPrincipleQ) {
        principle = mPrincipleQ[1].replace(/\\n/g, '\n').replace(/\\"/g, '"')
        continue
      }
      const mTags = line.match(/^\s*tags:\s*\[(.*)\]\s*$/)
      if (mTags) {
        mTags[1].split(',').forEach((x) => {
          const s = x.trim().replace(/^['"]|['"]$/g, '')
          if (s) tags.push(s)
        })
        continue
      }
      const mConf = line.match(/^\s*confidence:\s*([\d.]+)\s*$/)
      if (mConf) {
        confidence = Number(mConf[1]) || confidence
        continue
      }
      const mSrc = line.match(/^\s*sources:\s*(\[[\s\S]*\])\s*$/)
      if (mSrc) {
        try {
          const arr = JSON.parse(mSrc[1]) as unknown
          if (Array.isArray(arr)) {
            for (const s of arr) sources.push(String(s))
          }
        } catch {
          /* ignore */
        }
        continue
      }
    }
    if (inPrincipleBlock) principle = principleLines.join('\n').trim()
    if (id && title && principle) {
      out.push({ id, title, principle, tags, confidence, sources: sources.length ? sources : undefined })
    }
  }
  return out
}

export function loadPatterns(): Pattern[] {
  if (cache) return cache
  const fp = path.join(process.cwd(), 'data', 'patterns', 'v1.yaml')
  if (!fs.existsSync(fp)) {
    cache = []
    return cache
  }
  const raw = fs.readFileSync(fp, 'utf8')
  cache = parsePatternsYaml(raw)
  return cache
}

export function clearPatternsCache(): void {
  cache = null
}

export function getPatternsByTags(tags: string[], limit = 5): Pattern[] {
  const all = loadPatterns()
  const tagSet = new Set(tags.map((t) => t.toLowerCase()))
  const scored = all.map((p) => ({
    pattern: p,
    score: p.tags.filter((t) => tagSet.has(t.toLowerCase())).length * (p.confidence || 0.5)
  }))
  scored.sort((a, b) => b.score - a.score)
  return scored
    .filter((s) => s.score > 0)
    .slice(0, limit)
    .map((s) => s.pattern)
}

export function getPatternById(id: string): Pattern | null {
  return loadPatterns().find((p) => p.id === id) || null
}

export function searchPatterns(query: string, tagFilter: string[]): Pattern[] {
  const q = query.trim().toLowerCase()
  const all = loadPatterns()
  const tagSet = new Set(tagFilter.map((t) => t.toLowerCase()).filter(Boolean))
  return all.filter((p) => {
    if (tagSet.size > 0 && !p.tags.some((t) => tagSet.has(t.toLowerCase()))) return false
    if (!q) return true
    const blob = (p.title + ' ' + p.principle + ' ' + p.tags.join(' ')).toLowerCase()
    return blob.includes(q)
  })
}
