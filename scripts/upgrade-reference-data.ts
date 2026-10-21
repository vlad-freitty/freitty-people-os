// Reference data without any fake people: `npm run db:upgrade`. Run it after `prisma migrate deploy` on a new production
// database (then `npm run admin:create`) and after every release. Idempotent; never touches anything edited by hand.
//  - system calendar layers (birthdays, work anniversaries) and the starter request templates (created only when missing)
//  - phase 6: PTO absence types, a default policy per type, the absence template with two approvals
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { ensureAbsenceTypes, ensurePtoPolicies, ensureSystemLayers } from "../src/server/seed/calendar";
import { ensureSystemRoles } from "../src/server/seed/roles";
import { seedStarterTemplates, upgradeStarterTemplates } from "../src/server/seed/templates";

const prisma = new PrismaClient();

async function main() {
  await ensureSystemRoles(prisma);
  await ensureSystemLayers(prisma);
  await ensureAbsenceTypes(prisma);
  await ensurePtoPolicies(prisma);
  await seedStarterTemplates(prisma);
  const upgraded = await upgradeStarterTemplates(prisma);
  console.log(`absence types and policies: ok; absence template: ${upgraded ? "new version published" : "unchanged"}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
