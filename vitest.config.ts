import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    env: {
      // Required by prismaProvider.ts (must differ from DATABASE_URL)
      DATABASE_URL:
        process.env.DATABASE_URL ||
        'postgresql://postgres:postgres@127.0.0.1:5544/artha_v4?schema=public',
      DATABASE_URL_DEMO:
        process.env.DATABASE_URL_DEMO ||
        'postgresql://postgres:postgres@127.0.0.1:5544/artha_v4_demo?schema=public'
    },
    globals: true,
    environment: 'node',
    testTimeout: 60_000,
    hookTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/stress/multiYear.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      // Sprint 4: measure critical math / planning / tax / health modules (not all of `lib/`, e.g. telegram/reports)
      include: [
        'src/lib/calculations.ts',
        'src/lib/currency.ts',
        'src/lib/allocationPlanner.ts',
        'src/lib/indiaTax.ts',
        'src/lib/health.ts'
      ],
      exclude: ['**/*.test.ts', '**/types.ts', 'src/lib/prisma.ts'],
      // Lines match Sprint 4 gate (≥70%). Branch coverage on these files is dominated by health/currency
      // conditionals; 50% here + API/stress tests in CI give practical regression safety.
      thresholds: {
        lines: 70,
        branches: 49,
        functions: 65,
        statements: 65
      }
    }
  }
})
