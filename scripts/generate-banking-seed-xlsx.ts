/**
 * Writes seed-data/Banking_Input.xlsx matching the Sprint 1 banking workbook layout
 * (Target Set, FUND Plan, cash Flow sheet) for local smoke tests.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as XLSX from 'xlsx'

const root = path.join(__dirname, '..')
const outDir = path.join(root, 'seed-data')
const outFile = path.join(outDir, 'Banking_Input.xlsx')

const targetRows = [
  ['Key', 'Value'],
  ['investment_horizon_years', 7],
  ['equity_target', 60],
  ['bonds_target', 30],
  ['cash_target', 10],
  ['target_return', 14],
  ['Monthly SIP (CZK)', 15000]
]

const fundHeader = [
  'Fund ID',
  'Name',
  'Category',
  'Monthly SIP Planned (CZK)',
  'Units',
  'NAV',
  'Value',
  'Status',
  'Day'
]

const fundRows: (string | number)[][] = [
  ['CZ0008472347-F46745396', 'Dynamic Mix', 'Equity', 0, 1723, 2.0189, 3478.56, 'Inactive', '-'],
  ['CZ0008472321-F46745394', 'Conservative Mix', 'Equity', 0, 2181, 1.4254, 3108.8, 'Inactive', '-'],
  ['CZ0008476280-F335620136', 'REICO Long Lease', 'Equity', 0, 1435, 1.2274, 1761.32, 'Active', '-'],
  ['CZ0008472263-F45677989', 'Sporobond', 'Bonds', 2000, 3332, 2.4653, 8214.38, 'Active', '14th'],
  ['CZ0008472230-F45677991', 'Corporate Bonds', 'Bonds', 1500, 3452, 1.6371, 5651.27, 'Active', '14th'],
  ['CZ0008472271-F45677988', 'Sporoinvest', 'Cash', 500, 3538, 2.2097, 7817.92, 'Active', '14th'],
  ['CZ0008472305-F46745390', 'Akciový Mix', 'Equity', 0, 587, 2.9529, 1733.35, 'Inactive', '-'],
  ['CZ0008472248-F46745393', 'GLOBAL STOCKS FF', 'Equity', 6500, 4860, 1.2789, 6215.45, 'Active', '14th'],
  ['CZ0008472404-F46745391', 'Top Stocks', 'Equity', 2000, 462, 4.1292, 1907.69, 'Active', '14th'],
  ['AT0000A10QN3-F84220020', 'Emerging Markets', 'Equity', 1500, 0.175, 7741.75, 1354.81, 'Active', '14th'],
  ['CZ0008475043-F187727369', 'Small Caps', 'Equity', 1000, 441, 2.1443, 945.64, 'Active', '14th']
]

const cashHeader = [
  'Fund ID',
  'Fund Invested (13/11/2025)',
  'Fund Invested (13/12/2025)',
  'Fund Invested (13/01/2026)',
  'Fund Invested (13/02/2026)',
  'Fund Invested (13/03/2026)',
  'Fund Invested (14/04/2026)',
  'Fund Invested (14/05/2026)'
]

/**
 * Negative = purchase (cash out). Empty string for future month.
 * Totals are tuned so summed contributions sit near FUND Plan book value (~42k); the old seed summed
 * ~104k and made “Gain vs SIP” look like a bogus −60% loss against current NAV.
 */
const cashRows: (string | number)[][] = [
  ['CZ0008472347-F46745396', -210, -210, -210, -105, '', '', ''],
  ['CZ0008472321-F46745394', -210, -210, -210, -105, '', '', ''],
  ['CZ0008476280-F335620136', -84, -84, -84, -84, -84, -84, ''],
  ['CZ0008472263-F45677989', -840, -840, -840, -840, -840, -2730, ''],
  ['CZ0008472230-F45677991', -630, -630, -630, -630, -630, -1890, ''],
  ['CZ0008472271-F45677988', -210, -210, -210, -210, -210, -630, ''],
  ['CZ0008472305-F46745390', -210, -210, -210, -105, '', '', ''],
  ['CZ0008472248-F46745393', -2730, -2730, -2730, -2730, -2730, -2730, ''],
  ['CZ0008472404-F46745391', -840, -840, -840, -840, -840, -840, ''],
  ['AT0000A10QN3-F84220020', -630, -630, -630, -630, -630, -630, ''],
  ['CZ0008475043-F187727369', -420, -420, -420, -420, -420, '', '']
]

function main() {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(targetRows), 'Target Set')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([fundHeader, ...fundRows]), 'FUND Plan')
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cashHeader, ...cashRows]), 'cash Flow sheet')
  XLSX.writeFile(wb, outFile)
  // eslint-disable-next-line no-console
  console.log('Wrote', outFile)
}

main()
