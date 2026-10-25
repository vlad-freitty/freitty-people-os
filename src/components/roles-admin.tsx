"use client";

import {
  Delete02Icon,
  FileEditIcon,
  InformationCircleIcon,
  Search01Icon,
  Settings02Icon,
  ShieldKeyIcon,
  UserGroupIcon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { LocalTime } from "./local-time";
import { useModalClose } from "./overlay";
import { Avatar, Badge, Button, Empty, Field, IconTile } from "./ui";

type Scope = "all" | "departments" | "self";
type Role = {
  id: string;
  code: string;
  nameUk: string;
  nameEn: string | null;
  isSystem: boolean;
  locked: boolean;
  userCount: number;
  permissions: Record<string, Scope>;
};
type Catalog = { key: string; group: string; scopes: Scope[] }[];

const GROUP_ICONS: Record<string, IconSvgElement> = { people: UserGroupIcon, admin: Settings02Icon, requests: FileEditIcon, money: Wallet01Icon };
// narrowest first, so the control reads left → right as "less → more"
const SCOPE_ORDER: Scope[] = ["self", "departments", "all"];

/** One role at a time: pick it from the pills, then set every permission with a segmented scope control. */
export function RoleMatrix({ roles, catalog, canManage }: { roles: Role[]; catalog: Catalog; canManage: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(roles[0]?.id ?? "");
  const [draft, setDraft] = useState<Record<string, Record<string, Scope>>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, { ...r.permissions }])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(catalog.map((c) => c.group))];
  const role = roles.find((r) => r.id === selectedId) ?? roles[0];
  if (!role) return null;
  const editable = canManage && !role.locked;
  const granted = Object.keys(draft[role.id] ?? {}).length;

  const setCell = (roleId: string, key: string, value: Scope | "") => {
    setDraft((d) => {
      const next = { ...d[roleId] };
      if (value) next[key] = value;
      else delete next[key];
      return { ...d, [roleId]: next };
    });
    setDirty((s) => new Set(s).add(roleId));
  };

  const save = (r: Role) =>
    start(async () => {
      setError(null);
      try {
        await api(`/roles/${r.id}`, { method: "PATCH", body: { permissions: draft[r.id] } });
        setDirty((s) => {
          const n = new Set(s);
          n.delete(r.id);
          return n;
        });
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });

  const remove = (r: Role) =>
    start(async () => {
      setError(null);
      try {
        await api(`/roles/${r.id}`, { method: "DELETE" });
        setSelectedId(roles.find((x) => x.id !== r.id)?.id ?? "");
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });

  return (
    <div className="space-y-5">
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("roles.rolesTab")}>
        {roles.map((r) => {
          const active = r.id === role.id;
          return (
            <li key={r.id}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setSelectedId(r.id)}
                className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium whitespace-nowrap transition ${active ? "border-navy bg-navy text-white" : "border-line-strong bg-paper text-ink-soft hover:bg-cream"}`}
              >
                {localized(locale, r.nameUk, r.nameEn)}
                <span className={`inline-flex items-center gap-1 text-xs ${active ? "text-white/70" : "text-ink-mute"}`}>
                  <HugeiconsIcon icon={UserGroupIcon} size={13} />
                  {r.userCount}
                </span>
                {dirty.has(r.id) && <span className="size-2 rounded-full bg-warn" aria-label={t("admin2.unsaved")} />}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cream px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconTile icon={ShieldKeyIcon} tone={role.locked ? "navy" : role.isSystem ? "blue" : "ok"} size={40} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-bold text-ink-2">
              {localized(locale, role.nameUk, role.nameEn)}
              {role.isSystem && <Badge>{t("roles.system")}</Badge>}
            </p>
            <p className="text-xs text-ink-mute">
              <span className="font-mono">{role.code}</span> · {t("roles.users")}: {role.userCount} · {t("admin2.grantedCount", { n: granted, total: catalog.length })}
            </p>
          </div>
        </div>
        {editable && (
          <div className="flex flex-wrap gap-2">
            {!role.isSystem && role.userCount === 0 && (
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => window.confirm(t("admin2.confirmDeleteRole", { name: localized(locale, role.nameUk, role.nameEn) })) && remove(role)}
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} />
                {t("common.delete")}
              </Button>
            )}
            <Button disabled={pending || !dirty.has(role.id)} onClick={() => save(role)}>
              {t("common.save")}
            </Button>
          </div>
        )}
      </div>

      <ErrorBox error={error} />
      {role.locked && <Empty icon={InformationCircleIcon}>{t("roles.locked")}</Empty>}

      <div className="grid gap-4 xl:grid-cols-2">
        {groups.map((g) => (
          <section key={g} className="rounded-2xl border border-line p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-ink-2">
              <IconTile icon={GROUP_ICONS[g] ?? Settings02Icon} tone="neutral" size={28} />
              {t(`permissionGroups.${g}` as "permissionGroups.people")}
            </h3>
            <ul className="divide-y divide-line">
              {catalog
                .filter((c) => c.group === g)
                .map((c) => {
                  const value = draft[role.id]?.[c.key] ?? "";
                  const options: (Scope | "")[] = ["", ...SCOPE_ORDER.filter((s) => c.scopes.includes(s))];
                  return (
                    <li key={c.key} className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink-2">{t(`permissions.${c.key}` as "permissions.audit.view")}</span>
                        <span className="block font-mono text-[10px] text-ink-mute">{c.key}</span>
                      </span>
                      <span className="inline-flex shrink-0 self-start rounded-full border border-line-strong bg-paper p-0.5 sm:self-auto" role="radiogroup" aria-label={t(`permissions.${c.key}` as "permissions.audit.view")}>
                        {options.map((s) => {
                          const on = value === s;
                          return (
                            <button
                              key={s || "none"}
                              type="button"
                              role="radio"
                              aria-checked={on}
                              disabled={!editable}
                              onClick={() => setCell(role.id, c.key, s)}
                              className={`rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap transition disabled:cursor-not-allowed ${on ? (s ? "bg-navy text-white" : "bg-cream-deep text-ink") : "text-ink-mute enabled:hover:text-ink"}`}
                            >
                              {s ? t(`scopes.${s}`) : t("roles.noAccess")}
                            </button>
                          );
                        })}
                      </span>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

export function NewRoleForm({ roles }: { roles: Role[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const close = useModalClose();
  const [code, setCode] = useState("");
  const [nameUk, setNameUk] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [copyFrom, setCopyFrom] = useState(roles.find((r) => r.code === "user")?.id ?? "");
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          setError(null);
          try {
            const permissions = roles.find((r) => r.id === copyFrom)?.permissions ?? {};
            await api("/roles", { body: { code, nameUk, nameEn: nameEn || null, permissions } });
            setCode("");
            setNameUk("");
            setNameEn("");
            router.refresh();
            close?.();
          } catch (err) {
            setError(err);
          }
        });
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("roles.nameUk")}>
          <input className="field" required autoFocus value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
        </Field>
        <Field label={t("roles.nameEn")}>
          <input className="field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
        </Field>
        <Field label={t("roles.code")}>
          <input className="field font-mono" required pattern="[a-z][a-z0-9_]{1,40}" placeholder="team_lead" value={code} onChange={(e) => setCode(e.target.value)} />
          <span className="mt-1 block text-xs text-ink-mute">{t("admin2.codeHint")}</span>
        </Field>
        <Field label={t("roles.copyFrom")}>
          <select className="field" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {localized(locale, r.nameUk, r.nameEn)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {t("common.cancel")}
          </Button>
        )}
        <Button disabled={pending}>{t("roles.newRole")}</Button>
      </div>
    </form>
  );
}

type UserRow = {
  id: string;
  email: string;
  isActive: boolean;
  lastLoginAt: string | null;
  role: { id: string; code: string };
  employee: { id: string; name: string } | null;
};

export function UsersTable({ users, roles, isSuperadmin }: { users: UserRow[]; roles: Role[]; isSuperadmin: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const assign = (userId: string, roleId: string) =>
    start(async () => {
      setError(null);
      try {
        await api(`/users/${userId}/role`, { method: "PUT", body: { roleId } });
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  const q = query.trim().toLowerCase();
  const rows = q ? users.filter((u) => `${u.email} ${u.employee?.name ?? ""}`.toLowerCase().includes(q)) : users;
  return (
    <div className="space-y-3">
      <label className="relative block sm:max-w-72">
        <HugeiconsIcon icon={Search01Icon} size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-mute" />
        <input className="field pl-9!" value={query} placeholder={t("admin2.searchUsers")} aria-label={t("admin2.searchUsers")} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <ErrorBox error={error} />
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("employee.name")}</th>
              <th>{t("roles.lastLogin")}</th>
              <th>{t("roles.assign")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const lockedRow = !isSuperadmin && u.role.code === "superadmin";
              return (
                <tr key={u.id} className={u.isActive ? "" : "opacity-60"}>
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar name={u.employee?.name ?? u.email} muted={!u.isActive} />
                      <span className="min-w-0">
                        <span className="block font-bold text-ink-2">{u.employee?.name ?? t("common.none")}</span>
                        <span className="block text-xs text-ink-mute">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="text-xs whitespace-nowrap text-ink-soft">{u.lastLoginAt ? <LocalTime iso={u.lastLoginAt} /> : t("common.none")}</td>
                  <td className="min-w-48">
                    <select className="field" disabled={pending || lockedRow} value={u.role.id} onChange={(e) => assign(u.id, e.target.value)} aria-label={t("roles.assign")}>
                      {roles
                        .filter((r) => isSuperadmin || r.code !== "superadmin" || r.id === u.role.id)
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            {localized(locale, r.nameUk, r.nameEn)}
                          </option>
                        ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <Empty icon={Search01Icon}>{t("common.noResults")}</Empty>}
    </div>
  );
}
