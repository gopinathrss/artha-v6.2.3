/**
 * First-run / manual bulk import of Tier 2 historical NAVs (holdings + library).
 * Usage: node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/import-historical-navs.ts
 */
import { importAllHistoricalNavs } from '../src/lib/historical/import'

async function main() {
  const r = await importAllHistoricalNavs()
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ processed: r.processed, errorCount: r.errors.length, errors: r.errors.slice(0, 20) }, null, 2))
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e)
  process.exit(1)
})
