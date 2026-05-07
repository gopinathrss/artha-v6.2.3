/**
 * Ensure database exists on a local PostgreSQL (trust auth) without psql.exe.
 * Uses PostgreSQL wire protocol v3 over TCP — only node:net (no pg npm package).
 * Usage: node scripts/pg-ensure-artha-db.mjs [port] [dbname]
 */
import net from 'net'

const host = process.env.PGHOST || '127.0.0.1'
const port = Number(process.argv[2] || process.env.PGPORT || 5544)
const dbName = process.argv[3] || 'artha_v4'
const user = process.env.PGUSER || 'postgres'
const maintDb = 'postgres'

/** One logical message: type byte + int32 length (length includes its 4 bytes, excludes type byte) + payload */
function parseMessages(buf) {
  const out = []
  let o = 0
  while (o + 5 <= buf.length) {
    const type = String.fromCharCode(buf[o])
    const len = buf.readInt32BE(o + 1)
    if (len < 4 || o + 1 + len > buf.length) break
    out.push({ type, payload: buf.subarray(o + 5, o + 1 + len) })
    o += 1 + len
  }
  return { messages: out, rest: buf.subarray(o) }
}

function buildStartupMessage(database) {
  const kv = `user\0${user}\0database\0${database}\0client_encoding\0UTF8\0\0`
  const body = Buffer.from(kv, 'utf8')
  const totalLen = 4 + 4 + body.length
  const buf = Buffer.allocUnsafe(totalLen)
  buf.writeInt32BE(totalLen, 0)
  buf.writeInt32BE(196608, 4) // 3.0
  body.copy(buf, 8)
  return buf
}

function buildQueryMessage(sql) {
  const q = Buffer.from(sql + '\0', 'utf8')
  const len = 4 + q.length
  const buf = Buffer.allocUnsafe(1 + 4 + q.length)
  buf[0] = 'Q'.charCodeAt(0)
  buf.writeInt32BE(len, 1)
  q.copy(buf, 5)
  return buf
}

function buildTerminate() {
  const buf = Buffer.allocUnsafe(5)
  buf[0] = 'X'.charCodeAt(0)
  buf.writeInt32BE(4, 1)
  return buf
}

function parseErrorFields(payload) {
  let s = ''
  let i = 0
  while (i < payload.length) {
    const z = payload.indexOf(0, i)
    if (z <= i) break
    const field = String.fromCharCode(payload[i])
    const msg = payload.subarray(i + 1, z).toString('utf8')
    if (field === 'M' || field === 'D') s += (s ? ' ' : '') + msg
    i = z + 1
  }
  return s || payload.toString('utf8')
}

async function pgSession(database, fn) {
  return new Promise((resolve, reject) => {
    const sock = net.createConnection({ host, port }, () => {
      sock.setTimeout(25000)
      sock.write(buildStartupMessage(database))
    })
    let acc = Buffer.alloc(0)
    const queue = []
    let waiter = null

    function tryParse() {
      const { messages, rest } = parseMessages(acc)
      acc = rest
      for (const m of messages) {
        if (waiter) {
          const w = waiter
          waiter = null
          w(m)
        } else {
          queue.push(m)
        }
      }
    }

    sock.on('data', (chunk) => {
      acc = Buffer.concat([acc, chunk])
      tryParse()
    })

    sock.on('timeout', () => {
      sock.destroy()
      reject(new Error(`Timeout connecting to ${host}:${port}`))
    })

    sock.on('error', reject)

    function nextMessage() {
      if (queue.length) return Promise.resolve(queue.shift())
      return new Promise((r) => {
        waiter = r
      })
    }

    ;(async () => {
      try {
        await fn({ write: (b) => sock.write(b), nextMessage, end: () => sock.end() })
        resolve()
      } catch (e) {
        reject(e)
      }
    })()
  })
}

async function waitReady(sess) {
  for (;;) {
    const m = await sess.nextMessage()
    if (m.type === 'R') {
      const auth = m.payload.readInt32BE(0)
      if (auth !== 0) {
        throw new Error(
          `Authentication not supported (need trust on 127.0.0.1). Auth type ${auth}`
        )
      }
    } else if (m.type === 'N') {
      /* NoticeResponse — ignore */
    } else if (m.type === 'S' || m.type === 'K') {
      /* ParameterStatus, BackendKeyData */
    } else if (m.type === 'Z') {
      if (m.payload.length >= 1) return
    } else if (m.type === 'E') {
      throw new Error(`Startup error: ${parseErrorFields(m.payload)}`)
    }
  }
}

async function runSimpleQuery(sess, sql) {
  sess.write(buildQueryMessage(sql))
  const rows = []
  for (;;) {
    const m = await sess.nextMessage()
    if (m.type === 'T' || m.type === 'n' || m.type === 'N' || m.type === 'I') {
      /* RowDescription, NoData, Notice, EmptyQuery */
    } else if (m.type === 'D') {
      rows.push(m.payload)
    } else if (m.type === 'C') {
      /* CommandComplete */
    } else if (m.type === 'Z') {
      return rows
    } else if (m.type === 'E') {
      const msg = parseErrorFields(m.payload)
      const err = new Error(msg)
      err.pgMessage = msg
      throw err
    }
  }
}

async function main() {
  await pgSession(maintDb, async (sess) => {
    await waitReady(sess)
    const rows = await runSimpleQuery(
      sess,
      `SELECT 1 FROM pg_database WHERE datname = '${dbName.replace(/'/g, "''")}'`
    )
    if (rows.length > 0) {
      console.error(`[pg-ensure] Database "${dbName}" already exists.`)
      sess.write(buildTerminate())
      sess.end()
      return
    }
    console.error(`[pg-ensure] Creating database "${dbName}"…`)
    try {
      await runSimpleQuery(
        sess,
        `CREATE DATABASE "${dbName.replace(/"/g, '""')}" ENCODING 'UTF8' TEMPLATE template0`
      )
    } catch (e) {
      const t = e.pgMessage || e.message || ''
      if (/already exists|duplicate|42P04/i.test(t)) {
        console.error(`[pg-ensure] Database "${dbName}" already exists (race). OK.`)
      } else {
        throw e
      }
    }
    sess.write(buildTerminate())
    sess.end()
  })
  console.error('[pg-ensure] Done.')
}

main().catch((e) => {
  console.error('[pg-ensure] Failed:', e.message || e)
  process.exit(1)
})
