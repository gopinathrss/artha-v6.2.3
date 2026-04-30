/**
 * Task 1 smoke: FX_FRESHNESS WARN/FAIL vs age. Run:
 *   node --env-file=.env ./node_modules/tsx/dist/cli.mjs scripts/smoke-fx-task1.ts
 */
import { prisma } from '../src/lib/prisma'
import { runHealthChecks } from '../src/lib/health'

async function fxFreshness(): Promise<string> {
  const c = (await runHealthChecks()).checks.find((x) => x.name === 'FX_FRESHNESS')
  return JSON.stringify(c)
}

async function main() {
  console.log('--- Step A: constants in currency.ts ---')
  const fs = await import('fs/promises')
  const src = await fs.readFile('src/lib/currency.ts', 'utf8')
  for (const line of src.split('\n')) {
    if (line.includes('FX_STALENESS_WARN_HOURS') || line.includes('FX_STALENESS_FAIL_HOURS')) {
      console.log(line.trim())
    }
  }

  console.log('\n--- Step B1: set FX 30h old → expect WARN ---')
  await prisma.$executeRawUnsafe(`UPDATE "FXRate" SET "fetchedAt" = NOW() - INTERVAL '30 hours'`)
  console.log(await fxFreshness())

  console.log('\n--- Step B2: set FX 200h old → expect FAIL ---')
  await prisma.$executeRawUnsafe(`UPDATE "FXRate" SET "fetchedAt" = NOW() - INTERVAL '200 hours'`)
  console.log(await fxFreshness())

  console.log('\n--- Step C: restore freshness (NOW) ---')
  await prisma.$executeRawUnsafe(`UPDATE "FXRate" SET "fetchedAt" = NOW()`)
  console.log(await fxFreshness())

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
