-- System roles + default permissions (generated from src/server/authz/permissions.ts).
-- Creates missing system roles with defaults; adds the permissions listed in NEW_PERMISSIONS to existing roles.

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'superadmin', 'Суперадмін', 'Superadmin', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'superadmin')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (SELECT NULL::text AS permission, NULL::text AS scope WHERE false) p;

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'ceo', 'CEO', 'CEO', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'ceo')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'all'), ('employees.view_sensitive', 'all'), ('employees.edit', 'all'), ('rates.edit', 'all'), ('shifts.manage', 'all'), ('payments.manage', 'all'), ('org.manage', 'all'), ('roles.assign', 'all'), ('roles.manage', 'all'), ('import.run', 'all'), ('settings.manage', 'all'), ('audit.view', 'all'), ('systems.manage', 'all'), ('assets.manage', 'all'), ('balances.adjust', 'all'), ('templates.manage', 'all'), ('templates.publish', 'all'), ('requests.initiate', 'all'), ('requests.view', 'all'), ('steps.reassign', 'all')) AS p(permission, scope);

INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT "id", 'shifts.manage', 'all'::"PermissionScope" FROM "role" WHERE "code" = 'ceo'
ON CONFLICT DO NOTHING;

INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT "id", 'payments.manage', 'all'::"PermissionScope" FROM "role" WHERE "code" = 'ceo'
ON CONFLICT DO NOTHING;

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'dept_head', 'Керівник відділу', 'Department head', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'dept_head')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'departments'), ('employees.view_sensitive', 'departments'), ('employees.edit', 'departments'), ('rates.edit', 'departments'), ('audit.view', 'departments'), ('templates.manage', 'departments'), ('templates.publish', 'departments'), ('requests.initiate', 'all'), ('requests.view', 'departments'), ('steps.reassign', 'departments'), ('shifts.manage', 'departments')) AS p(permission, scope);

INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT "id", 'shifts.manage', 'departments'::"PermissionScope" FROM "role" WHERE "code" = 'dept_head'
ON CONFLICT DO NOTHING;

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'user', 'Користувач', 'User', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'user')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'self'), ('employees.view_sensitive', 'self'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self')) AS p(permission, scope);

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'hr', 'HR', 'HR', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'hr')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'self'), ('employees.view_sensitive', 'self'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self')) AS p(permission, scope);

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'legal', 'Legal', 'Legal', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'legal')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'self'), ('employees.view_sensitive', 'self'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self')) AS p(permission, scope);

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'finance', 'Фінанси', 'Finance', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'finance')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'all'), ('employees.view_sensitive', 'all'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self'), ('payments.manage', 'all')) AS p(permission, scope);

INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT "id", 'payments.manage', 'all'::"PermissionScope" FROM "role" WHERE "code" = 'finance'
ON CONFLICT DO NOTHING;

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'office_admin', 'Адміністратор офісу', 'Office admin', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'office_admin')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'self'), ('employees.view_sensitive', 'self'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self')) AS p(permission, scope);


-- finance sees every profile and its money (phase 3 plan); only upgrades the untouched defaults
UPDATE "role_permission" SET "scope" = 'all'
WHERE "roleId" IN (SELECT "id" FROM "role" WHERE "code" = 'finance')
  AND "permission" IN ('employees.view', 'employees.view_sensitive') AND "scope" = 'self';
