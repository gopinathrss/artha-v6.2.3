import type { AllocationRow } from './allocationRowTypes'
import { parsePlanAllocations } from './allocationPlanSchema'
import { getPrisma } from './prisma'

async function logPlanReaderFailure(planId: string, msg: string): Promise<void> {
  try {
    const prisma = await getPrisma()
    await prisma.systemHealth.create({
      data: {
        checkName: 'PLAN_READER',
        status: 'FAIL',
        message: msg.slice(0, 1900),
        metadata: { planId } as object
      }
    })
  } catch {
    /* */
  }
}

/**
 * Parses `AllocationPlan.allocations` for read paths. On corrupt JSON, logs
 * `SystemHealth` and returns an empty row list so dashboards do not 500.
 */
export async function readPlanAllocationsOrEmpty(plan: {
  id: string
  allocations: unknown
}): Promise<AllocationRow[]> {
  try {
    return parsePlanAllocations(plan.allocations)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logPlanReaderFailure(plan.id, `parsePlanAllocations failed for plan ${plan.id}: ${msg}`)
    return []
  }
}

/** Mutations must not silently no-op on corrupt JSON — log and throw after SystemHealth. */
export async function readPlanAllocationsForMutation(plan: {
  id: string
  allocations: unknown
}): Promise<AllocationRow[]> {
  try {
    return parsePlanAllocations(plan.allocations)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await logPlanReaderFailure(plan.id, `parsePlanAllocations failed for plan ${plan.id}: ${msg}`)
    throw new Error('Plan allocations are invalid or corrupt — cannot update rows.')
  }
}
