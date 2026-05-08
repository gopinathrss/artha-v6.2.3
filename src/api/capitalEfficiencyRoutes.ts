import type { Express } from 'express'
import { Prisma, AccountRole } from '@prisma/client'
import { getPrisma } from '../lib/prisma'
import { computeCapitalEfficiency } from '../lib/intelligence/sleepingMoneyEngine'
import { validateInterestTiers } from '../lib/intelligence/interestTiers'

const ALLOWED_ROLE = new Set<string>(Object.values(AccountRole))

export function registerCapitalEfficiencyRoutes(app: Express): void {
  app.get('/api/capital-efficiency', async (_req, res) => {
    try {
      const prisma = await getPrisma()
      const report = await computeCapitalEfficiency(prisma)
      res.json({ success: true, data: report })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.patch('/api/accounts/:id/interest-tiers', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const body = (req.body || {}) as {
        interestTiers?: unknown
        emergencyFundTarget?: unknown
      }
      const { interestTiers, emergencyFundTarget } = body

      let tiersJson: Prisma.InputJsonValue | undefined
      if (interestTiers !== undefined) {
        const parsed =
          typeof interestTiers === 'string' ? JSON.parse(interestTiers) : interestTiers
        const validation = validateInterestTiers(parsed)
        if (!validation.valid) {
          return res.status(400).json({
            success: false,
            error: 'Invalid interest tier structure',
            details: validation.errors
          })
        }
        tiersJson = validation.tiers as unknown as Prisma.InputJsonValue
      }

      const data: Prisma.AccountUpdateInput = {}
      if (tiersJson !== undefined) data.interestTiers = tiersJson
      if (emergencyFundTarget !== undefined) {
        data.emergencyFundTarget = new Prisma.Decimal(String(emergencyFundTarget))
      }

      const account = await prisma.account.update({
        where: { id: req.params.id },
        data
      })
      res.json({ success: true, data: account })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })

  app.patch('/api/accounts/:id/role', async (req, res) => {
    try {
      const prisma = await getPrisma()
      const accountRole = (req.body as { accountRole?: unknown })?.accountRole
      const roleStr = accountRole == null ? '' : String(accountRole)
      if (!ALLOWED_ROLE.has(roleStr)) {
        return res.status(400).json({
          success: false,
          error: `Invalid role. Must be one of: ${[...ALLOWED_ROLE].join(', ')}`
        })
      }
      const account = await prisma.account.update({
        where: { id: req.params.id },
        data: { accountRole: roleStr as AccountRole }
      })
      res.json({ success: true, data: account })
    } catch (err) {
      res.status(500).json({ success: false, error: String(err) })
    }
  })
}
