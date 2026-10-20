-- System roles + default permissions (generated from src/server/authz/permissions.ts).
-- Creates missing system roles with defaults; adds permissions introduced in phase 1 to existing roles.

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
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'all'), ('employees.view_sensitive', 'all'), ('employees.edit', 'all'), ('rates.edit', 'all'), ('org.manage', 'all'), ('roles.assign', 'all'), ('roles.manage', 'all'), ('import.run', 'all'), ('settings.manage', 'all'), ('audit.view', 'all'), ('systems.manage', 'all'), ('assets.manage', 'all'), ('balances.adjust', 'all'), ('templates.manage', 'all'), ('templates.publish', 'all'), ('requests.initiate', 'all'), ('requests.view', 'all'), ('steps.reassign', 'all')) AS p(permission, scope);

INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT "id", 'balances.adjust', 'all'::"PermissionScope" FROM "role" WHERE "code" = 'ceo'
ON CONFLICT DO NOTHING;

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'dept_head', 'Керівник відділу', 'Department head', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'dept_head')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'departments'), ('employees.view_sensitive', 'departments'), ('employees.edit', 'departments'), ('rates.edit', 'departments'), ('audit.view', 'departments'), ('templates.manage', 'departments'), ('templates.publish', 'departments'), ('requests.initiate', 'all'), ('requests.view', 'departments'), ('steps.reassign', 'departments')) AS p(permission, scope);

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
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'self'), ('employees.view_sensitive', 'self'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self')) AS p(permission, scope);

WITH created AS (
  INSERT INTO "role" ("id", "code", "nameUk", "nameEn", "isSystem", "updatedAt")
  SELECT gen_random_uuid(), 'office_admin', 'Адміністратор офісу', 'Office admin', true, now()
  WHERE NOT EXISTS (SELECT 1 FROM "role" WHERE "code" = 'office_admin')
  RETURNING "id"
)
INSERT INTO "role_permission" ("roleId", "permission", "scope")
SELECT c."id", p.permission, p.scope::"PermissionScope" FROM created c, (VALUES ('directory.view', 'all'), ('employees.view', 'self'), ('employees.view_sensitive', 'self'), ('audit.view', 'self'), ('requests.initiate', 'all'), ('requests.view', 'self')) AS p(permission, scope);

