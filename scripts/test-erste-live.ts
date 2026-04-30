import { fetchErsteNav } from '../src/lib/nav/erste'
import { ERSTE_FUNDS } from '../tests/fixtures/erste-funds'

async function main() {
  console.log('Testing Erste NAV fetch for all 11 funds...\n')
  const results: Array<{
    name: string
    isin: string
    value: unknown
    error?: string
    fetchedAt: Date
  }> = []
  for (const f of ERSTE_FUNDS) {
    const r = await fetchErsteNav(f.notationId)
    const status = r.value !== null ? `NAV=${r.value}` : `ERROR=${r.error}`
    console.log(`${f.name.padEnd(24)} ${f.isin}  ${status}`)
    results.push({ name: f.name, isin: f.isin, ...r })
  }
  const ok = results.filter((r) => r.value !== null).length
  console.log(`\n${ok}/${ERSTE_FUNDS.length} funds returned valid NAV`)
  if (ok !== ERSTE_FUNDS.length) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
