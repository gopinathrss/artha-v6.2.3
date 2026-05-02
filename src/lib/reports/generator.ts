import { generateMonthlyReport } from './templates/monthly'
import { generateQuarterlyReport } from './templates/quarterly'
import { generateTaxYearReport } from './templates/taxYear'

export type SmartReportType = 'MONTHLY' | 'QUARTERLY' | 'TAX_YEAR'

export async function generateSmartReport(
  type: SmartReportType,
  period?: { start: Date; end: Date }
): Promise<{ html: string; metadata: Record<string, unknown> }> {
  switch (type) {
    case 'MONTHLY':
      return generateMonthlyReport(period)
    case 'QUARTERLY':
      return generateQuarterlyReport(period)
    case 'TAX_YEAR':
      return generateTaxYearReport(period)
    default:
      throw new Error(`Unknown report type: ${type}`)
  }
}
