import type { Response } from 'express'
import { describe, it, expect, vi } from 'vitest'
import { createExternalReadApiGate } from '../../src/api/externalReadApiGate'

function mockRes(): Partial<Response> {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  }
}

describe('createExternalReadApiGate', () => {
  const paths = new Set(['/api/overview'])

  it('allows same-origin GET without key', () => {
    const mw = createExternalReadApiGate({ apiKey: 'secret', paths })
    const req = {
      method: 'GET',
      path: '/api/overview',
      headers: { 'sec-fetch-site': 'same-origin' }
    } as any
    const next = vi.fn()
    const res = mockRes()
    mw(req, res as Response, next)
    expect(next).toHaveBeenCalled()
    expect(res.status).not.toHaveBeenCalled()
  })

  it('allows Bearer key for cross-site GET', () => {
    const mw = createExternalReadApiGate({ apiKey: 'secret', paths })
    const req = {
      method: 'GET',
      path: '/api/overview',
      headers: { authorization: 'Bearer secret', 'sec-fetch-site': 'cross-site' }
    } as any
    const next = vi.fn()
    const res = mockRes()
    mw(req, res as Response, next)
    expect(next).toHaveBeenCalled()
  })

  it('allows X-Artha-Api-Key (legacy)', () => {
    const mw = createExternalReadApiGate({ apiKey: 'secret', paths })
    const req = {
      method: 'GET',
      path: '/api/overview',
      headers: { 'x-artha-api-key': 'secret' }
    } as any
    const next = vi.fn()
    const res = mockRes()
    mw(req, res as Response, next)
    expect(next).toHaveBeenCalled()
  })

  it('allows X-Pie-Api-Key', () => {
    const mw = createExternalReadApiGate({ apiKey: 'secret', paths })
    const req = {
      method: 'GET',
      path: '/api/overview',
      headers: { 'x-pie-api-key': 'secret' }
    } as any
    const next = vi.fn()
    const res = mockRes()
    mw(req, res as Response, next)
    expect(next).toHaveBeenCalled()
  })

  it('rejects missing key when not same-origin', () => {
    const mw = createExternalReadApiGate({ apiKey: 'secret', paths })
    const req = {
      method: 'GET',
      path: '/api/overview',
      headers: { 'sec-fetch-site': 'cross-site' }
    } as any
    const next = vi.fn()
    const res = mockRes()
    mw(req, res as Response, next)
    expect(next).not.toHaveBeenCalled()
    expect(res.status).toHaveBeenCalledWith(401)
  })

  it('ignores non-listed paths', () => {
    const mw = createExternalReadApiGate({ apiKey: 'secret', paths })
    const req = { method: 'GET', path: '/api/intelligence/history', headers: {} } as any
    const next = vi.fn()
    const res = mockRes()
    mw(req, res as Response, next)
    expect(next).toHaveBeenCalled()
  })
})
