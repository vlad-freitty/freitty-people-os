// The first (or an emergency) superadmin — run on the server, there is no web sign-up (phase 7):
//   npm run admin:create -- --email admin@company.com --name "First Last"
//   npm run admin:create -- --email admin@company.com --reset     # new one-time password for that superadmin
//   npm run admin:create -- --email second@company.com --force    # another superadmin when one already exists
// Prints a one-time password once; it is stored only as a hash and must be changed at the first sign-in.
import "dotenv/config";
import { parseArgs } from "node:util";
import { prisma } from "../src/server/db";
import { ensureSystemRoles } from "../src/server/seed/roles";
import { bootstrapSuperadmin } from "../src/server/services/users";

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, reset: { type: "boolean" }, force: { type: "boolean" } },
  });
  if (!values.email) throw new Error("--email is required");
  await ensureSystemRoles(prisma);
  const { password, created } = await bootstrapSuperadmin({ email: values.email, name: values.name, reset: values.reset, force: values.force });
  console.log(`${created ? "Superadmin created" : "Password reset"}: ${values.email}`);
  console.log(`One-time password (shown once): ${password}`);
  console.log("Sign in with it — the system will ask for a new password.");
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
