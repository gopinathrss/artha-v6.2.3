import { importBankingInput } from '../src/lib/import/excelImport'

const p = process.argv[2]
if (!p) {
  // eslint-disable-next-line no-console
  console.error('Usage: tsx scripts/import-real-data.ts <path-to-xlsx>')
  process.exit(1)
}

importBankingInput(p)
  .then((result) => {
    // eslint-disable-next-line no-console
    console.log('Import complete:')
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(result, null, 2))
    process.exit(result.errors.length > 0 ? 1 : 0)
  })
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error('Import failed:', e)
    process.exit(1)
  })
