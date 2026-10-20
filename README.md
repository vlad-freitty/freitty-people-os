# FREITTY People OS

Internal HR system for the Octopos holding (FREITTY, NETQOR, YBIS). Next.js 15 + TypeScript, PostgreSQL + Prisma,
Auth.js (Microsoft Entra ID), next-intl (UA/EN), Tailwind, Vitest.

## Quick start (Windows, no Docker needed)

```bash
npm install
cp .env.example .env          # set AUTH_SECRET (any long random string)
npm run db                    # terminal 1: local PostgreSQL on :5433, keep it running
npx prisma migrate deploy     # terminal 2
npm run db:seed
npm run dev                   # http://localhost:3000 → "Dev login" → pick a user
```

Seeded users (fake): superadmin `superadmin@example.test`, CEO `ceo@example.test`, dept heads
`cs.head@example.test` / `eng.head@example.test`, users `agent.*@example.test`, `dev.petro@example.test`.

Import fixtures for trying the CSV import: `prisma/fixtures/` (org → employees-50 → rates).

## Tests

```bash
npm test        # needs `npm run db` running; uses the people_os_test database
```

## Production

- Set `AUTH_MICROSOFT_ENTRA_ID_ID`, `AUTH_MICROSOFT_ENTRA_ID_SECRET`,
  `AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant-id>/v2.0`, `AUTH_SECRET`, `AUTH_URL`,
  `DATABASE_URL`, `SUPERADMIN_EMAIL`. `DEV_LOGIN` has no effect in production.
- `docker build -t people-os .` — the container runs `prisma migrate deploy` on start.

Decisions, deviations from the PRD and open questions: see [CLAUDE.md](CLAUDE.md).
