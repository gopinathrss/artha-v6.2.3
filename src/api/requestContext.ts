/**
 * V6 request context middleware — assigns a stable request id and exposes a
 * sanitized error helper so handlers don't leak internal messages to clients.
 */
import type { Express, NextFunction, Request, Response } from 'express'
import crypto from 'crypto'

declare module 'express-serve-static-core' {
  interface Request {
    /** Stable id propagated to logs and the X-Request-Id response header. */
    pieRequestId?: string
  }
}

function newId(): string {
  return crypto.randomBytes(8).toString('hex')
}

export function registerRequestContext(app: Express): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    const incoming = String(req.headers['x-request-id'] || '').trim()
    const id = incoming.length > 0 && incoming.length <= 64 ? incoming : newId()
    req.pieRequestId = id
    res.setHeader('X-Request-Id', id)
    next()
  })
}

export function logServerError(req: Request, where: string, err: unknown): void {
  const id = req.pieRequestId || '-'
  const msg = err instanceof Error ? `${err.message}\n${err.stack || ''}` : String(err)
  // eslint-disable-next-line no-console
  console.error(`[PIE] ${id} ${req.method} ${req.path} :: ${where} :: ${msg}`)
}

/**
 * Send a sanitized 500. Internal details go to the server log only; the client
 * sees a generic message + the request id so the operator can correlate.
 */
export function send500(req: Request, res: Response, where: string, err: unknown): void {
  logServerError(req, where, err)
  if (res.headersSent) return
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    requestId: req.pieRequestId || null
  })
}
