import type { Application, NextFunction, Request, Response } from 'express'

const DEFAULT_PATHS = '/api/overview,/api/holdings,/api/health,/api/this-month,/api/alerts'

export type ExternalReadApiGateConfig = {
  apiKey: string
  paths: Set<string>
}

/** Pure middleware for tests; same-origin browser traffic passes without a key. */
export function createExternalReadApiGate(config: ExternalReadApiGateConfig) {
  const { apiKey, paths } = config
  return function externalReadApiGate(req: Request, res: Response, next: NextFunction): void {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    if (!paths.has(req.path)) {
      next()
      return
    }

    const site = String(req.headers['sec-fetch-site'] || '').toLowerCase()
    if (site === 'same-origin') {
      next()
      return
    }

    const auth = String(req.headers.authorization || '')
    const xkey = String(req.headers['x-pie-api-key'] || req.headers['x-artha-api-key'] || '').trim()
    const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    if (bearer === apiKey || xkey === apiKey) {
      next()
      return
    }

    res.status(401).json({
      success: false,
      error:
        'Read API gated: unset PIE_EXTERNAL_API_KEY (or legacy ARTHA_EXTERNAL_API_KEY) to disable, or send Authorization: Bearer <key> or X-Pie-Api-Key. Same-tab dashboard requests (Sec-Fetch-Site: same-origin) do not need a key.'
    })
  }
}

/**
 * When `PIE_EXTERNAL_API_KEY` or legacy `ARTHA_EXTERNAL_API_KEY` is non-empty, selected GET `/api/*` routes require
 * `Authorization: Bearer …` or `X-Pie-Api-Key` (legacy `X-Artha-Api-Key` accepted) unless the client is a same-origin browser
 * (Sec-Fetch-Site: same-origin). Use for n8n/cron on another host; leave unset for LAN-only trust.
 *
 * Override paths: `PIE_EXTERNAL_API_PATHS` or `ARTHA_EXTERNAL_API_PATHS` comma list (default: overview, holdings, health, this-month, alerts).
 */
export function registerExternalReadApiGate(app: Application): void {
  const apiKey = (process.env.PIE_EXTERNAL_API_KEY || process.env.ARTHA_EXTERNAL_API_KEY || '').trim()
  if (!apiKey) return

  const paths = new Set(
    (process.env.PIE_EXTERNAL_API_PATHS || process.env.ARTHA_EXTERNAL_API_PATHS || DEFAULT_PATHS)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  )

  app.use(createExternalReadApiGate({ apiKey, paths }))
}
