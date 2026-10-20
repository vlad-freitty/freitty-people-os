import type { PermissionScope } from "@prisma/client";

/**
 * Permission catalog. Roles are configured by the superadmin in the UI (role → permission → scope);
 * checks in code always reference these keys. Adding a key here makes it appear in the role editor.
 *
 * Scopes are nested: all ⊃ departments ⊃ self. "departments" = departments the user heads, including
 * their sub-departments, plus the user's own record.
 */
export const PERMISSIONS = {
  "directory.view": { scopes: ["all"], group: "people" },
  "employees.view": { scopes: ["all", "departments", "self"], group: "people" },
  "employees.view_sensitive": { scopes: ["all", "departments", "self"], group: "people" },
  "employees.edit": { scopes: ["all", "departments", "self"], group: "people" },
  "rates.edit": { scopes: ["all", "departments"], group: "people" },
  "org.manage": { scopes: ["all"], group: "admin" },
  "roles.assign": { scopes: ["all"], group: "admin" },
  "roles.manage": { scopes: ["all"], group: "admin" },
  "import.run": { scopes: ["all"], group: "admin" },
  "settings.manage": { scopes: ["all"], group: "admin" },
  "audit.view": { scopes: ["all", "departments", "self"], group: "admin" },
  // Phase 1 (request engine) — present in the catalog so roles can be prepared upfront
  "templates.manage": { scopes: ["all", "departments"], group: "requests" },
  "templates.publish": { scopes: ["all", "departments"], group: "requests" },
  "requests.initiate": { scopes: ["all"], group: "requests" },
  "steps.reassign": { scopes: ["all", "departments"], group: "requests" },
} as const satisfies Record<string, { scopes: readonly PermissionScope[]; group: string }>;

export type Permission = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as Permission[];

export function isPermission(value: string): value is Permission {
  return value in PERMISSIONS;
}

export function isScopeAllowed(permission: Permission, scope: PermissionScope): boolean {
  return (PERMISSIONS[permission].scopes as readonly PermissionScope[]).includes(scope);
}

export const SUPERADMIN_ROLE = "superadmin";

/** Default permissions for the system roles, used by the seed. Matches PRD section 2, with CEO = all rights. */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, Partial<Record<Permission, PermissionScope>>> = {
  ceo: Object.fromEntries(PERMISSION_KEYS.map((p) => [p, "all"])),
  dept_head: {
    "directory.view": "all",
    "employees.view": "departments",
    "employees.view_sensitive": "departments",
    "employees.edit": "departments",
    "rates.edit": "departments",
    "audit.view": "departments",
    "templates.manage": "departments",
    "templates.publish": "departments",
    "requests.initiate": "all",
    "steps.reassign": "departments",
  },
  user: {
    "directory.view": "all",
    "employees.view": "self",
    "employees.view_sensitive": "self",
    "audit.view": "self",
    "requests.initiate": "all",
  },
};
