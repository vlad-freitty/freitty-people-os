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
  "systems.manage": { scopes: ["all"], group: "admin" },
  "assets.manage": { scopes: ["all"], group: "admin" },
  /** manual balance corrections (PRD 5: superadmin only by default) */
  "balances.adjust": { scopes: ["all"], group: "admin" },
  "templates.manage": { scopes: ["all", "departments"], group: "requests" },
  "templates.publish": { scopes: ["all", "departments"], group: "requests" },
  "requests.initiate": { scopes: ["all"], group: "requests" },
  /** self = requests I started, that are about me, or where I have a step */
  "requests.view": { scopes: ["all", "departments", "self"], group: "requests" },
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

const USER_PERMISSIONS: Partial<Record<Permission, PermissionScope>> = {
  "directory.view": "all",
  "employees.view": "self",
  "employees.view_sensitive": "self",
  "audit.view": "self",
  "requests.initiate": "all",
  "requests.view": "self",
};

/**
 * Default permissions for the system roles. Matches PRD section 2, with CEO = all rights.
 * hr / legal / finance / office_admin are assignment groups for the role_first_free rule (phase 1 plan, decision 2):
 * same rights as a user, the superadmin extends them as needed.
 * Existing databases get these through the SQL data migration; keep both in sync.
 */
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
    "requests.view": "departments",
    "steps.reassign": "departments",
  },
  user: USER_PERMISSIONS,
  hr: USER_PERMISSIONS,
  legal: USER_PERMISSIONS,
  finance: USER_PERMISSIONS,
  office_admin: USER_PERMISSIONS,
};

export const SYSTEM_ROLES = [
  { code: SUPERADMIN_ROLE, nameUk: "Суперадмін", nameEn: "Superadmin" },
  { code: "ceo", nameUk: "CEO", nameEn: "CEO" },
  { code: "dept_head", nameUk: "Керівник відділу", nameEn: "Department head" },
  { code: "user", nameUk: "Користувач", nameEn: "User" },
  { code: "hr", nameUk: "HR", nameEn: "HR" },
  { code: "legal", nameUk: "Legal", nameEn: "Legal" },
  { code: "finance", nameUk: "Фінанси", nameEn: "Finance" },
  { code: "office_admin", nameUk: "Адміністратор офісу", nameEn: "Office admin" },
];
