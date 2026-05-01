# Demo Mode Isolation (F6.1)

ARTHA's demo mode runs against a completely separate Postgres database (`artha_v4_demo` by default) so that toggling demo on/off cannot corrupt real user data.

## Setup

1. Create the demo database:

   ```bash
   createdb -U postgres -p 5544 artha_v4_demo
   ```

2. Apply schema:

   Set `DATABASE_URL` to the demo database temporarily, then run `prisma migrate deploy`.  
   Or: `pg_dump -s artha_v4 | psql artha_v4_demo`

3. Add to `.env`:

   ```env
   DATABASE_URL=postgresql://postgres:postgres@localhost:5544/artha_v4
   DATABASE_URL_DEMO=postgresql://postgres:postgres@localhost:5544/artha_v4_demo
   ```

   Both must be set and **must differ**. The server refuses to start otherwise.

## Safety guarantees

- `prismaProvider.ts` throws at startup if `DATABASE_URL` is unset
- `prismaProvider.ts` throws at startup if `DATABASE_URL_DEMO` is unset
- `prismaProvider.ts` throws if both URLs point at the same database
- Settings reads always go to `realPrisma` (configuration lives in the real DB regardless of demo state)
- All other DB operations use `getPrisma()`, which returns `demoPrisma` or `realPrisma` based on `Settings.demoModeEnabled`
- Toggling demo ON wipes and reseeds the demo DB only
- The real DB is untouched during demo mode

## Verifying isolation

Run this manual test occasionally:

1. Insert a marker row in the real DB (e.g. a `Holding` with a distinctive name).
2. Toggle demo ON via `PATCH /api/settings` with `demoModeEnabled: true`.
3. Confirm the marker still exists in the real DB (`psql` against `artha_v4`).
4. Toggle demo OFF.
5. Confirm the marker still exists in the real DB and appears again in `/api/overview`.
