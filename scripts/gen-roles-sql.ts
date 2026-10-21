// Usage: npx tsx scripts/gen-roles-sql.ts > prisma/migrations/<new>/migration.sql (edit NEW_PERMISSIONS first)
import { DEFAULT_ROLE_PERMISSIONS, SYSTEM_ROLES } from "../src/server/authz/permissions";
const NEW_PERMISSIONS: string[] = [];
const q = (s: string | null) => (s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const out: string[] = ["-- System roles + default permissions (generated from src/server/authz/permissions.ts).",
  "-- Creates missing system roles with defaults; adds the permissions listed in NEW_PERMISSIONS to existing roles.", ""];
for (const r of SYSTEM_ROLES) {
  const perms = Object.entries(DEFAULT_ROLE_PERMISSIONS[r.code] ?? {});
  const values = perms.map(([p, s]) => `(${q(p)}, ${q(s!)})`).join(", ");
  out.push(`WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), ${q(r.code)}, ${q(r.nameUk)}, ${q(r.nameEn)}, true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = ${q(r.code)})
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c${values ? `, (VALUES ${values}) AS p(permission, scope)` : ", (SELECT NULL::text AS permission, NULL::text AS scope WHERE false) p"};
`);
  for (const [p, s] of perms.filter(([p]) => NEW_PERMISSIONS.includes(p))) {
    out.push(`INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT "id", ${q(p)}, ${q(s!)}::"PermissionScope" FROM "role" WHERE "code" = ${q(r.code)}
ON CONFLICT DO NOTHING;
`);
  }
}
console.log(out.join("\n"));
