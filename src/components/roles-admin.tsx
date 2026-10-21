"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { LocalTime } from "./local-time";
import { Badge, Button, Field } from "./ui";

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

export function RoleMatrix({ roles, catalog, canManage }: { roles: Role[]; catalog: Catalog; canManage: boolean }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, Record<string, Scope>>>(() =>
    Object.fromEntries(roles.map((r) => [r.id, { ...r.permissions }])),
  );
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const groups = [...new Set(catalog.map((c) => c.group))];

  const setCell = (roleId: string, key: string, value: string) => {
    setDraft((d) => {
      const next = { ...d[roleId] };
      if (value) next[key] = value as Scope;
      else delete next[key];
      return { ...d, [roleId]: next };
    });
    setDirty((s) => new Set(s).add(roleId));
  };

  const save = (role: Role) =>
    start(async () => {
      setError(null);
      try {
        await api(`/roles/${role.id}`, { method: "PATCH", body: { permissions: draft[role.id] } });
        setDirty((s) => {
          const n = new Set(s);
          n.delete(role.id);
          return n;
        });
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });

  const remove = (role: Role) =>
    start(async () => {
      setError(null);
      try {
        await api(`/roles/${role.id}`, { method: "DELETE" });
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });

  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-card border border-edge bg-paper">
        <table className="table min-w-[720px]">
          <thead>
            <tr>
              <th className="sticky left-0 bg-paper">{t("roles.permission")}</th>
              {roles.map((r) => (
                <th key={r.id} className="min-w-[140px]">
                  <span className="block text-ink normal-case">{localized(locale, r.nameUk, r.nameEn)}</span>
                  <span className="font-mono text-[10px] normal-case">{r.code}</span>
                  {r.isSystem && <span className="ml-1"><Badge>{t("roles.system")}</Badge></span>}
                  <span className="block text-[10px] normal-case">
                    {t("roles.users")}: {r.userCount}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Group key={g} title={t(`permissionGroups.${g}` as "permissionGroups.people")} colSpan={roles.length + 1}>
                {catalog
                  .filter((c) => c.group === g)
                  .map((c) => (
                    <tr key={c.key}>
                      <td className="sticky left-0 bg-paper">
                        {t(`permissions.${c.key}` as "permissions.audit.view")}
                        <span className="block font-mono text-[10px] text-ink-mute">{c.key}</span>
                      </td>
                      {roles.map((r) => (
                        <td key={r.id}>
                          <select
                            className="field py-1 text-xs"
                            disabled={r.locked || !canManage}
                            value={draft[r.id]?.[c.key] ?? ""}
                            onChange={(e) => setCell(r.id, c.key, e.target.value)}
                          >
                            <option value="">{t("roles.noAccess")}</option>
                            {c.scopes.map((s) => (
                              <option key={s} value={s}>
                                {t(`scopes.${s}`)}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
              </Group>
            ))}
            {canManage && (
              <tr>
                <td className="sticky left-0 bg-paper" />
                {roles.map((r) => (
                  <td key={r.id}>
                    {r.locked ? (
                      <span className="text-[11px] text-ink-mute">{t("roles.locked")}</span>
                    ) : (
                      <div className="flex flex-col gap-1">
                        <Button disabled={pending || !dirty.has(r.id)} onClick={() => save(r)} className="py-1 text-xs">
                          {t("common.save")}
                        </Button>
                        {!r.isSystem && r.userCount === 0 && (
                          <Button variant="ghost" disabled={pending} onClick={() => remove(r)} className="py-1 text-xs">
                            {t("common.delete")}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Group({ title, colSpan, children }: { title: string; colSpan: number; children: React.ReactNode }) {
  return (
    <>
      <tr>
        <td colSpan={colSpan} className="bg-cream-deep/60 text-xs font-semibold tracking-wide text-ink-soft uppercase">
          {title}
        </td>
      </tr>
      {children}
    </>
  );
}

export function NewRoleForm({ roles }: { roles: Role[] }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [nameUk, setNameUk] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [copyFrom, setCopyFrom] = useState(roles.find((r) => r.code === "user")?.id ?? "");
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="space-y-3"
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
          } catch (err) {
            setError(err);
          }
        });
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t("roles.code")}>
          <input className="field font-mono" required pattern="[a-z][a-z0-9_]{1,40}" value={code} onChange={(e) => setCode(e.target.value)} />
        </Field>
        <Field label={t("roles.nameUk")}>
          <input className="field" required value={nameUk} onChange={(e) => setNameUk(e.target.value)} />
        </Field>
        <Field label={t("roles.nameEn")}>
          <input className="field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
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
      <Button disabled={pending}>{t("roles.newRole")}</Button>
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
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      <div className="overflow-x-auto rounded-card border border-edge bg-paper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("roles.email")}</th>
              <th>{t("employee.name")}</th>
              <th>{t("roles.lastLogin")}</th>
              <th>{t("roles.assign")}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const lockedRow = !isSuperadmin && u.role.code === "superadmin";
              return (
                <tr key={u.id}>
                  <td className="font-mono text-xs">{u.email}</td>
                  <td>{u.employee?.name ?? t("common.none")}</td>
                  <td>{u.lastLoginAt ? <LocalTime iso={u.lastLoginAt} /> : t("common.none")}</td>
                  <td>
                    <select
                      className="field py-1 text-sm"
                      disabled={pending || lockedRow}
                      value={u.role.id}
                      onChange={(e) => assign(u.id, e.target.value)}
                    >
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
    </div>
  );
}
