"use client";

import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Key01Icon,
  Search01Icon,
  Tick02Icon,
  UserAdd01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { localized } from "@/lib/format";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { LocalTime } from "./local-time";
import { Modal } from "./overlay";
import { Avatar, Badge, Button, EmptyState, Field, FormSection } from "./ui";

type Option = { id: string; label: string };
type RoleOption = { id: string; code: string; nameUk: string; nameEn: string | null };
type Issued = { name: string; email: string; password: string };
const GRADES = ["senior_management", "middle_management", "first_line_management", "individual_contributor"] as const;

function CopyButton({ text, label, variant = "secondary", className = "" }: { text: string; label: string; variant?: "primary" | "secondary"; className?: string }) {
  const t = useTranslations("access");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      onClick={() => {
        void navigator.clipboard?.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={17} />
      {copied ? t("copied") : label}
    </Button>
  );
}

/** The one-time password, shown once (phase 7): login + password, each with its own copy button, and both together. */
function PasswordResult({ issued, onDone }: { issued: Issued; onDone: () => void }) {
  const t = useTranslations("access");
  const loginUrl = typeof window === "undefined" ? "/login" : `${window.location.origin}/login`;
  const all = `${t("copyAllSite")}: ${loginUrl}\n${t("copyAllLogin")}: ${issued.email}\n${t("copyAllPassword")}: ${issued.password}`;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl bg-ok-tint px-4 py-3 text-sm text-ok-strong">
        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={22} />
        <span>{t("issuedFor", { name: issued.name })}</span>
      </div>
      <div className="space-y-3">
        <div>
          <span className="label">{t("login")}</span>
          <div className="flex gap-2">
            <p className="field flex-1 truncate bg-cream!">{issued.email}</p>
            <CopyButton text={issued.email} label={t("copy")} />
          </div>
        </div>
        <div>
          <span className="label">{t("oneTimePassword")}</span>
          <div className="flex gap-2">
            <p className="field flex-1 bg-cream! font-mono text-base! font-bold tracking-wider select-all">{issued.password}</p>
            <CopyButton text={issued.password} label={t("copy")} />
          </div>
        </div>
      </div>
      <p className="rounded-2xl bg-warn-tint px-4 py-3 text-sm text-warn">{t("shownOnce")}</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" onClick={onDone}>
          {t("done")}
        </Button>
        <CopyButton text={all} label={t("copyAll")} variant="primary" />
      </div>
    </div>
  );
}

/** "Видати доступ": the form in a dialog, then the password in the same dialog. */
export function IssueAccessButton({
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
  const [open, setOpen] = useState(false);
  const [v, setV] = useState(empty);
  const [error, setError] = useState<unknown>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [pending, start] = useTransition();
  const bind = (k: keyof typeof v) => ({
    value: v[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })),
  });
  const nullable = (s: string) => (s.trim() ? s.trim() : null);
  const close = () => {
    setOpen(false);
    setIssued(null);
    setError(null);
  };

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <HugeiconsIcon icon={UserAdd01Icon} size={18} />
        {t("access.new")}
      </Button>
      {open && (
        <Modal
          title={issued ? t("access.passwordTitle") : t("access.new")}
          subtitle={issued ? undefined : t("access.newHint")}
          icon={issued ? Key01Icon : UserAdd01Icon}
          size="lg"
          onClose={close}
        >
          {issued ? (
            <PasswordResult issued={issued} onDone={close} />
          ) : (
            <form
              className="space-y-6"
              onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  setError(null);
                  try {
                    const res = await api<{ password: string }>("/users", {
                      body: { ...v, managerId: nullable(v.managerId), grade: nullable(v.grade), locationId: nullable(v.locationId) },
                    });
                    setIssued({ name: `${v.firstName} ${v.lastName}`, email: v.workEmail, password: res.password });
                    setV(empty);
                    router.refresh();
                  } catch (err) {
                    setError(err);
                  }
                });
              }}
            >
              <ErrorBox error={error} />
              <FormSection n={1} title={t("access.sectionLogin")}>
                <Field label={t("access.email")}>
                  <input className="field" type="email" required autoFocus placeholder="name@freitty.com" {...bind("workEmail")} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("employee.firstName")}>
                    <input className="field" required {...bind("firstName")} />
                  </Field>
                  <Field label={t("employee.lastName")}>
                    <input className="field" required {...bind("lastName")} />
                  </Field>
                </div>
              </FormSection>

              <FormSection n={2} title={t("access.role")} hint={t("access.roleHint")}>
                <select className="field" required {...bind("roleId")}>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {localized(locale, r.nameUk, r.nameEn)}
                    </option>
                  ))}
                </select>
              </FormSection>

              <FormSection n={3} title={t("access.sectionCard")} hint={t("access.sectionCardHint")}>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("employee.department")}>
                    <select className="field" required {...bind("departmentId")}>
                      <option value="">{t("access.choose")}</option>
                      {departments.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label={t("employee.position")}>
                    <input className="field" required placeholder={t("access.positionPlaceholder")} {...bind("position")} />
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
                </div>
              </FormSection>

              <details className="group rounded-2xl border border-line px-4 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-bold text-ink-2">
                  <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="transition group-open:rotate-90" />
                  {t("access.sectionMore")}
                  <span className="ml-1 font-normal text-ink-mute">· {t("access.optional")}</span>
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
              </details>

              <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
                <Button type="button" variant="secondary" onClick={close}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" disabled={pending}>
                  <HugeiconsIcon icon={Key01Icon} size={18} />
                  {t("access.generate")}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}
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
  const [query, setQuery] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [issued, setIssued] = useState<Issued | null>(null);
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
  const q = query.trim().toLowerCase();
  const rows = q ? accounts.filter((a) => `${a.name ?? ""} ${a.email} ${a.position ?? ""} ${a.department ?? ""}`.toLowerCase().includes(q)) : accounts;
  const onlyMe = accounts.length === 1 && accounts[0]!.id === meId;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-bold text-ink-2">
          {t("accountsTitle")} <Badge>{accounts.length}</Badge>
        </h2>
        <label className="relative w-full sm:w-72">
          <HugeiconsIcon icon={Search01Icon} size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-mute" />
          <input className="field pl-9!" value={query} placeholder={t("searchPlaceholder")} onChange={(e) => setQuery(e.target.value)} aria-label={t("searchPlaceholder")} />
        </label>
      </div>
      <ErrorBox error={error} />
      <div className="overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>{t("person")}</th>
              <th>{t("role")}</th>
              <th>{t("status")}</th>
              <th>{t("lastLogin")}</th>
              <th className="text-right">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const me = a.id === meId;
              const manageable = !me && (isSuperadmin || a.role.code !== "superadmin");
              return (
                <tr key={a.id} className={a.isActive ? "" : "opacity-60"}>
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar name={a.name ?? a.email} muted={!a.isActive} />
                      <span className="min-w-0">
                        <span className="block font-bold text-ink-2">
                          {a.name ?? a.email}
                          {me && <span className="ml-2 align-middle"><Badge tone="ink">{t("you")}</Badge></span>}
                        </span>
                        <span className="block text-xs text-ink-mute">
                          {a.email}
                          {a.position && ` · ${a.position}`}
                          {a.department && ` · ${a.department}`}
                        </span>
                      </span>
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
                    {manageable ? (
                      <span className="flex justify-end gap-2">
                        {a.isActive && (
                          <Button
                            variant="secondary"
                            disabled={pending}
                            onClick={() => {
                              if (a.hasPassword && !window.confirm(t("confirmReset", { name: a.name ?? a.email }))) return;
                              run(async () => {
                                const res = await api<{ password: string }>(`/users/${a.id}/password`, { method: "POST" });
                                setIssued({ name: a.name ?? a.email, email: a.email, password: res.password });
                              });
                            }}
                          >
                            <HugeiconsIcon icon={Key01Icon} size={16} />
                            {a.hasPassword ? t("reset") : t("generateShort")}
                          </Button>
                        )}
                        <Button
                          variant={a.isActive ? "danger" : "secondary"}
                          disabled={pending}
                          onClick={() => {
                            if (a.isActive && !window.confirm(t("confirmDeactivate", { name: a.name ?? a.email }))) return;
                            run(() => api(`/users/${a.id}/active`, { method: "PUT", body: { active: !a.isActive } }));
                          }}
                        >
                          {a.isActive ? t("deactivate") : t("activate")}
                        </Button>
                      </span>
                    ) : (
                      <span className="block text-right text-xs text-ink-mute">{me ? t("ownAccountHint") : t("superadminOnly")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p className="py-6 text-center text-sm text-ink-mute">{t("nothingFound")}</p>}
      {onlyMe && (
        <div className="mt-4">
          <EmptyState icon={UserGroupIcon} title={t("onlyYouTitle")} hint={t("onlyYouHint")} />
        </div>
      )}
      {issued && (
        <Modal title={t("passwordTitle")} icon={Key01Icon} onClose={() => setIssued(null)}>
          <PasswordResult issued={issued} onDone={() => setIssued(null)} />
        </Modal>
      )}
    </>
  );
}
