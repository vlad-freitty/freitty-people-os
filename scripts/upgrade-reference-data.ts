// Brings reference data of an existing database up to date after a release: `npm run db:upgrade`.
// Idempotent; never touches anything edited by hand (each step checks for the untouched starter values).
//  - phase 6: PTO absence types, a default policy per type, the absence template with two approvals
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ensureAbsenceTypes, ensurePtoPolicies } from "../src/server/seed/calendar";
import { upgradeStarterTemplates } from "../src/server/seed/templates";

const prisma = new PrismaClient();

async function main() {
  await ensureAbsenceTypes(prisma);
  await ensurePtoPolicies(prisma);
  const upgraded = await upgradeStarterTemplates(prisma);
  console.log(`absence types and policies: ok; absence template: ${upgraded ? "new version published" : "unchanged"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
