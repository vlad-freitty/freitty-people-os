// Vercel build (package.json "vercel-build"): every production deploy brings the database up to date by itself —
// no manual `prisma migrate deploy` / `npm run db:upgrade` after a release.
//   1. prisma migrate deploy  — new tables and columns (only on production deploys: previews share the same database)
//   2. db:upgrade             — reference data (roles, absence types, policies, starter templates); never fake people
//   3. next build
// Migrations use the direct (unpooled) Neon connection when it is there; the app itself keeps the pooled DATABASE_URL.
import { execSync } from "node:child_process";

const run = (cmd, env = {}) => execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });

const production = process.env.VERCEL_ENV === "production";
if (production) {
  const direct = process.env.DATABASE_URL_UNPOOLED || process.env.POSTGRES_URL_NON_POOLING || process.env.DATABASE_URL;
  if (!direct) throw new Error("DATABASE_URL is not set for the production environment");
  run("npx prisma migrate deploy", { DATABASE_URL: direct });
  run("npx tsx scripts/upgrade-reference-data.ts", { DATABASE_URL: direct });
} else {
  console.log(`vercel-build: ${process.env.VERCEL_ENV ?? "local"} build — database migrations skipped`);
}
run("npx next build");
