import { Decimal } from '@prisma/client/runtime/library'
import { fetchUnseenSipEmails } from './imap'
import { parseErsteSipEmail } from './parsers/erste'
import { realPrisma as prisma } from '../prismaProvider'
import { getSecret } from '../secrets'

export async function runEmailIngestion(): Promise<{
  fetched: number
  parsed: number
  previewsCreated: number
  autoIngested: number
  errors: string[]
}> {
  const settings = await prisma.settings.findFirst()
  const imapPassword = settings ? await getSecret('imapPassword') : null
  if (!settings?.imapHost || !settings?.imapUser || !imapPassword) {
    return {
      fetched: 0,
      parsed: 0,
      previewsCreated: 0,
      autoIngested: 0,
      errors: ['IMAP not configured in Settings']
    }
  }

  const emails = await fetchUnseenSipEmails({
    host: settings.imapHost,
    port: settings.imapPort ?? 993,
    user: settings.imapUser,
    password: imapPassword
  })

  let parsed = 0
  let previewsCreated = 0
  let autoIngested = 0
  const errors: string[] = []

  for (const email of emails) {
    try {
      const parsedResult = parseErsteSipEmail(email.subject, email.body)
      parsed++

      if (email.messageId) {
        const dup = await prisma.emailIngestionPreview.findFirst({
          where: { messageIdHeader: email.messageId }
        })
        if (dup) {
          continue
        }
      }

      const preview = await prisma.emailIngestionPreview.create({
        data: {
          receivedAt: email.date,
          fromAddress: email.from,
          subject: email.subject,
          parsedType: parsedResult.parsedType,
          parsedAmount: parsedResult.amount,
          parsedFundIsin: parsedResult.fundIsin,
          parsedFundName: parsedResult.fundName,
          parsedDate: parsedResult.date,
          rawBody: email.body.slice(0, 5000),
          confidence: new Decimal(parsedResult.confidence),
          status: 'PENDING',
          messageIdHeader: email.messageId ?? undefined
        }
      })
      previewsCreated++

      if (
        settings.autoIngestEmails &&
        parsedResult.confidence >= 70 &&
        parsedResult.fundIsin &&
        parsedResult.amount
      ) {
        const holding = await prisma.holding.findFirst({
          where: { isin: parsedResult.fundIsin }
        })
        if (holding) {
          const when = parsedResult.date ?? email.date
          const exec = await prisma.sipExecution.create({
            data: {
              planId: null,
              planRowKey: null,
              scheduledDate: when,
              executedDate: when,
              isin: holding.isin,
              fundName: holding.name,
              side: 'BUY',
              amountCzk: parsedResult.amount,
              currency: 'CZK',
              status: 'EXECUTED',
              notes: `Auto-ingested from email: ${email.subject.slice(0, 100)}`,
              confirmationMethod: 'EMAIL_INGEST',
              navAtExecution: null,
              unitsAcquired: null,
              amountLocal: null
            }
          })
          await prisma.emailIngestionPreview.update({
            where: { id: preview.id },
            data: {
              status: 'AUTO_INGESTED',
              linkedExecutionId: exec.id,
              reviewedAt: new Date()
            }
          })
          autoIngested++
        }
      }
    } catch (e: unknown) {
      errors.push(`Email ${email.uid}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return { fetched: emails.length, parsed, previewsCreated, autoIngested, errors }
}
