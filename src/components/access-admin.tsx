"use client";

import { Cancel01Icon, Copy01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { LocalTime } from "./local-time";
import { Badge, Button, Field } from "./ui";

type Option = { id: string; label: string };
type RoleOption = { id: string; code: string; nameUk: string; nameEn: string | null };
const GRADES = ["senior_management", "middle_management", "first_line_management", "individual_contributor"] as const;

/** The one-time password, shown once (phase 7) — like the dialog in the reference screenshot. */
function PasswordDialog({ title, email, password, onClose }: { title: string; email: string; password: string; onClose: () => void }) {
  const t = useTranslations("access");
  const [copied, setCopied] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-labelledby="pw-title">
      <div className="w-full max-w-md rounded-3xl bg-paper p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <h2 id="pw-title" className="text-xl font-bold text-ink">
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("close")} className="text-ink-mute hover:text-ink">
            <HugeiconsIcon icon={Cancel01Icon} size={20} />
          </button>
        </div>
        <p className="mt-4 text-center text-sm text-ink-soft">{t("shownOnce", { email })}</p>
        <p className="mt-5 rounded-xl border border-line-strong bg-cream px-4 py-3 text-center font-mono text-lg font-bold tracking-wider text-ink select-all">
          {password}
        </p>
        <Button
          type="button"
          className="mt-4 h-12 w-full"
          onClick={() => {
            void navigator.clipboard?.writeText(password);
            setCopied(true);
          }}
        >
          <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={18} />
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}

export function NewAccessForm({
  roles,
  departments,
  locations,
  managers,
}: {
  roles: RoleOption[];
  departments: Option[];
  locations: Option[];
  managers: Option[];
}) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const defaultRole = roles.find((r) => r.code === "user")?.id ?? roles[0]?.id ?? "";
  const empty = {
    workEmail: "",
    firstName: "",
    lastName: "",
    roleId: defaultRole,
    departmentId: "",
    position: "",
    employmentType: "employee" as "employee" | "contractor",
    hireDate: new Date().toISOString().slice(0, 10),
    managerId: "",
    grade: "",
    locationId: "",
  };
  const [v, setV] = useState(empty);
  const [error, setError] = useState<unknown>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })),
  });
  const nullable = (s: string) => (s.trim() ? s.trim() : null);

  return (
    <>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            setError(null);
            try {
              const res = await api<{ password: string }>("/users", {
                body: { ...v, managerId: nullable(v.managerId), grade: nullable(v.grade), locationId: nullable(v.locationId) },
              });
              setIssued({ email: v.workEmail, password: res.password });
              setV(empty);
              router.refresh();
            } catch (err) {
              setError(err);
            }
          });
        }}
      >
        <ErrorBox error={error} />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label={t("access.email")}>
            <input className="field" type="email" required {...bind("workEmail")} />
          </Field>
          <Field label={t("employee.firstName")}>
            <input className="field" required {...bind("firstName")} />
          </Field>
          <Field label={t("employee.lastName")}>
            <input className="field" required {...bind("lastName")} />
          </Field>
          <Field label={t("access.role")}>
            <select className="field" required {...bind("roleId")}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {localized(locale, r.nameUk, r.nameEn)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("employee.department")}>
            <select className="field" required {...bind("departmentId")}>
              <option value="">{t("common.none")}</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("employee.position")}>
            <input className="field" required {...bind("position")} />
          </Field>
          <Field label={t("employee.employmentType")}>
            <select className="field" {...bind("employmentType")}>
              {(["employee", "contractor"] as const).map((x) => (
                <option key={x} value={x}>
                  {t(`employmentType.${x}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("employee.hireDate")}>
            <input className="field" type="date" required {...bind("hireDate")} />
          </Field>
          <Field label={t("employee.manager")}>
            <select className="field" {...bind("managerId")}>
              <option value="">{t("common.none")}</option>
              {managers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("employee.grade")}>
            <select className="field" {...bind("grade")}>
              <option value="">{t("common.none")}</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {t(`grade.${g}`)}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("employee.location")}>
            <select className="field" {...bind("locationId")}>
              <option value="">{t("common.none")}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {t("access.generate")}
        </Button>
      </form>
      {issued && <PasswordDialog title={t("access.passwordTitle")} email={issued.email} password={issued.password} onClose={() => setIssued(null)} />}
    </>
  );
}

export type AccountRow = {
  id: string;
  email: string;
  name: string | null;
  employeeId: string | null;
  position: string | null;
  department: string | null;
  role: { code: string; nameUk: string; nameEn: string | null };
  isActive: boolean;
  hasPassword: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
};

export function AccountsTable({ accounts, meId, isSuperadmin }: { accounts: AccountRow[]; meId: string; isSuperadmin: boolean }) {
  const t = useTranslations("access");
  const locale = useLocale();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });

  return (
    <>
      <ErrorBox error={error} />
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("person")}</th>
              <th>{t("role")}</th>
              <th>{t("status")}</th>
              <th>{t("lastLogin")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              const manageable = a.id !== meId && (isSuperadmin || a.role.code !== "superadmin");
              return (
                <tr key={a.id} className={a.isActive ? "" : "opacity-60"}>
                  <td>
                    <span className="block font-bold text-ink-2">{a.name ?? a.email}</span>
                    <span className="block text-xs text-ink-mute">
                      {a.email}
                      {a.position && ` · ${a.position}`}
                      {a.department && ` · ${a.department}`}
                    </span>
                  </td>
                  <td>
                    <Badge>{localized(locale, a.role.nameUk, a.role.nameEn)}</Badge>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {!a.isActive ? (
                        <Badge tone="red">{t("inactive")}</Badge>
                      ) : !a.hasPassword ? (
                        <Badge tone="neutral">{t("noPassword")}</Badge>
                      ) : a.mustChangePassword ? (
                        <Badge tone="warn">{t("pendingChange")}</Badge>
                      ) : (
                        <Badge tone="ok">{t("active")}</Badge>
                      )}
                      {a.locked && <Badge tone="red">{t("locked")}</Badge>}
                    </span>
                  </td>
                  <td className="text-xs whitespace-nowrap text-ink-soft">{a.lastLoginAt ? <LocalTime iso={a.lastLoginAt} /> : t("never")}</td>
                  <td>
                    {manageable && (
                      <span className="flex justify-end gap-2">
                        {a.isActive && (
                          <Button
                            variant="secondary"
                            disabled={pending}
                            onClick={() =>
                              run(async () => {
                                const res = await api<{ password: string }>(`/users/${a.id}/password`, { method: "POST" });
                                setIssued({ email: a.email, password: res.password });
                              })
                            }
                          >
                            {a.hasPassword ? t("reset") : t("generateShort")}
                          </Button>
                        )}
                        <Button
                          variant={a.isActive ? "danger" : "secondary"}
                          disabled={pending}
                          onClick={() => run(() => api(`/users/${a.id}/active`, { method: "PUT", body: { active: !a.isActive } }))}
                        >
                          {a.isActive ? t("deactivate") : t("activate")}
                        </Button>
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {issued && <PasswordDialog title={t("passwordTitle")} email={issued.email} password={issued.password} onClose={() => setIssued(null)} />}
    </>
  );
}
