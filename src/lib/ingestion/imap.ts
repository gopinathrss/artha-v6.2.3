import { ImapFlow } from 'imapflow'
import { simpleParser } from 'mailparser'

export interface IngestedEmail {
  uid: number
  from: string
  subject: string
  date: Date
  body: string
  messageId?: string | null
}

function envelopeFromText(env: { from?: { address?: string; name?: string }[] } | undefined): string {
  if (!env?.from?.length) return ''
  return env.from.map((a) => a.address || a.name || '').filter(Boolean).join(', ')
}

export async function fetchUnseenSipEmails(opts: {
  host: string
  port: number
  user: string
  password: string
  mailbox?: string
}): Promise<IngestedEmail[]> {
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: true,
    auth: { user: opts.user, pass: opts.password }
  })

  const emails: IngestedEmail[] = []
  await client.connect()
  try {
    const lock = await client.getMailboxLock(opts.mailbox ?? 'INBOX')
    try {
      const since = new Date(Date.now() - 30 * 86400000)
      const uids = await client.search({ seen: false, since })
      if (!Array.isArray(uids) || uids.length === 0) return emails

      for await (const msg of client.fetch(uids, { uid: true, source: true, envelope: true }, { uid: true })) {
        const env = msg.envelope
        const fromText = envelopeFromText(env as { from?: { address?: string; name?: string }[] })
        const blob = `${fromText} ${env?.subject ?? ''}`.toLowerCase()
        if (!/erste|spořitelna|sporitelna|cs\.cz|investicnicentrum|george/.test(blob)) {
          continue
        }
        const parsed = await simpleParser(msg.source as Buffer)
        emails.push({
          uid: msg.uid,
          from: parsed.from?.text ?? fromText,
          subject: parsed.subject ?? env?.subject ?? '',
          date: parsed.date ?? env?.date ?? new Date(),
          body: parsed.text ?? (typeof parsed.html === 'string' ? parsed.html : '') ?? '',
          messageId: parsed.messageId ?? env?.messageId ?? null
        })
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout()
  }

  return emails
}

export async function testImapConnection(opts: {
  host: string
  port: number
  user: string
  password: string
  mailbox?: string
}): Promise<{ ok: boolean; error?: string }> {
  const client = new ImapFlow({
    host: opts.host,
    port: opts.port,
    secure: true,
    auth: { user: opts.user, pass: opts.password }
  })
  try {
    await client.connect()
    const lock = await client.getMailboxLock(opts.mailbox ?? 'INBOX')
    lock.release()
    await client.logout()
    return { ok: true }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    try {
      await client.logout()
    } catch {
      /* ignore */
    }
    return { ok: false, error: msg }
  }
}
