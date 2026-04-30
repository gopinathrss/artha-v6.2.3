/**
 * Load before `src/api/server` so Express does not start the HTTP listener
 * and startup jobs (see server.ts: NODE_ENV === 'test' guard).
 */
process.env.NODE_ENV = 'test'
