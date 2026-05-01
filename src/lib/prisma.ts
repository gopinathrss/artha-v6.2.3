export {
  getPrisma,
  realPrisma,
  demoPrisma,
  invalidateDemoStateCache
} from './prismaProvider'
import { realPrisma } from './prismaProvider'

/** Points at the live database; tests mock this module and override exports. */
export const prisma = realPrisma
