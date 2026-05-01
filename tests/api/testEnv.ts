/**
 * Load before `src/api/server` so Express does not start the HTTP listener
 * and startup jobs (see server.ts: NODE_ENV === 'test' guard).
 */
process.env.NODE_ENV = 'test'

/** prismaProvider requires distinct real + demo URLs before any import of `../lib/prisma`. */
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL =
    'postgresql://postgres:postgres@127.0.0.1:5544/artha_v4?schema=public'
}
if (!process.env.DATABASE_URL_DEMO) {
  process.env.DATABASE_URL_DEMO =
    'postgresql://postgres:postgres@127.0.0.1:5544/artha_v4_demo?schema=public'
}
