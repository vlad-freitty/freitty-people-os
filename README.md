# FREITTY People OS

Internal HR system for the Octopos holding (FREITTY, NETQOR, YBIS). Next.js 15 + TypeScript, PostgreSQL + Prisma,
Auth.js (email + password), next-intl (UA/EN), Tailwind, Vitest.

## Quick start (Windows, no Docker needed)

```bash
npm install
cp .env.example .env          # set AUTH_SECRET (any long random string)
npm run db                    # terminal 1: local PostgreSQL on :5433, keep it running
npx prisma migrate deploy     # terminal 2
npm run db:seed
npm run dev                   # http://localhost:3000 → "Dev login" → pick a user (or npm run admin:create)
npm run worker                # background jobs: daily balances, overdue notices, Telegram bot
```

Seeded users (fake): superadmin `superadmin@example.test`, CEO `ceo@example.test`, dept heads
`cs.head@example.test` / `eng.head@example.test`, users `agent.*@example.test`, `dev.petro@example.test`.

Import fixtures for trying the CSV import: `prisma/fixtures/` (org → employees-50 → rates).

## Tests

```bash
npm test        # needs `npm run db` running; uses the people_os_test database
```

## Production

- Set `AUTH_SECRET`, `AUTH_URL` (https), `DATABASE_URL`. `DEV_LOGIN` has no effect in production.
- First admin (on the server, once): `npm run admin:create -- --email admin@company.com --name "First Last"` prints a
  one-time password; sign in and set your own. Everyone else gets access from **Доступи** (`/access`, superadmin and HR).
  Forgotten admin password: `npm run admin:create -- --email admin@company.com --reset`.
- New production database: `npx prisma migrate deploy` → `npm run db:upgrade` (roles, absence types, policies, starter
  templates — no fake data; never run `db:seed` there) → `npm run admin:create`. Run them from any machine with
  `DATABASE_URL` pointing to that database (Vercel has no shell).
- After every release: `npx prisma migrate deploy`, then `npm run db:upgrade`.
- Vercel runs only the web app: the worker (daily balances, Telegram delivery) needs a separate always-on host;
  balances are also synced on every page view and booking, so they stay correct without it.
- `docker build -t people-os .` — the container runs `prisma migrate deploy` on start.
- Run the worker next to the web container: `docker build --target worker -t people-os-worker .` — daily balances, overdue notices,
  Telegram delivery. Telegram needs `TELEGRAM_BOT_TOKEN` and `TELEGRAM_BOT_USERNAME` (see `.env.example`).

Decisions, deviations from the PRD and open questions: see [CLAUDE.md](CLAUDE.md).
