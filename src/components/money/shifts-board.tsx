"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { Badge, Button, Field } from "../ui";

type ShiftDto = {
  id: string;
  employee: { id: string; name: string };
  company: { id: string; name: string };
  department: { id: string; name: string };
  start: string;
  end: string;
  timezone: string;
  workDate: string;
  hours: number;
  shiftType: string;
  status: "planned" | "confirmed" | "locked";
};
type Option = { id: string; label: string };

const TONE = { planned: "warn", confirmed: "ok", locked: "neutral" } as const;

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  return { error, pending, run };
}

export function ShiftsBoard({ shifts, canManage }: { shifts: ShiftDto[]; canManage: boolean }) {
  const t = useTranslations("shifts");
  const locale = useLocale();
  const { error, pending, run } = useRun();
  const [selected, setSelected] = useState<string[]>([]);
  const planned = shifts.filter((s) => s.status === "planned").map((s) => s.id);
  const byDate = new Map<string, ShiftDto[]>();
  for (const s of shifts) byDate.set(s.workDate, [...(byDate.get(s.workDate) ?? []), s]);

  if (shifts.length === 0) return <p className="text-sm text-ink-mute">{t("empty")}</p>;
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {canManage && planned.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => setSelected(planned)}>
            {t("selectAll")}
          </Button>
          <Button disabled={pending || selected.length === 0} onClick={() => run(() => api("/shifts/confirm", { body: { ids: selected } }), () => setSelected([]))}>
            {t("confirmSelected")} ({selected.length})
          </Button>
        </div>
      )}
      <div className="overflow-x-auto rounded-xl border border-line bg-paper">
        <table className="table">
          <thead>
            <tr>
              {canManage && <th />}
              <th>{t("date")}</th>
              <th>{t("employee")}</th>
              <th>{t("start")}</th>
              <th>{t("end")}</th>
              <th>{t("hours")}</th>
              <th className="hidden md:table-cell">{t("type")}</th>
              <th className="hidden md:table-cell">{t("department")}</th>
              <th />
              {canManage && <th />}
            </tr>
          </thead>
          <tbody>
            {[...byDate.entries()].map(([date, list]) =>
              list.map((s, i) => (
                <tr key={s.id}>
                  {canManage && (
                    <td>
                      {s.status === "planned" && (
                        <input
                          type="checkbox"
                          aria-label={s.employee.name}
                          checked={selected.includes(s.id)}
                          onChange={(e) => setSelected((x) => (e.target.checked ? [...x, s.id] : x.filter((id) => id !== s.id)))}
                        />
                      )}
                    </td>
                  )}
                  <td className="whitespace-nowrap text-xs">{i === 0 ? formatDate(date, locale) : ""}</td>
                  <td>{s.employee.name}</td>
                  <td className="whitespace-nowrap font-mono text-xs">{s.start.slice(11)}</td>
                  <td className="whitespace-nowrap font-mono text-xs">
                    {s.end.slice(0, 10) !== s.start.slice(0, 10) && <span className="text-ink-mute">{s.end.slice(5, 10)} </span>}
                    {s.end.slice(11)}
                  </td>
                  <td>{s.hours}</td>
                  <td className="hidden md:table-cell">{s.shiftType}</td>
                  <td className="hidden text-xs md:table-cell">
                    {s.department.name}
                    <span className="block text-ink-mute">
                      {s.company.name} · {s.timezone}
                    </span>
                  </td>
                  <td>
                    <Badge tone={TONE[s.status]}>{t(`status.${s.status}`)}</Badge>
                  </td>
                  {canManage && (
                    <td>
                      {s.status !== "locked" && (
                        <Button variant="ghost" className="px-2 py-0.5 text-xs" disabled={pending} onClick={() => run(() => api(`/shifts/${s.id}`, { method: "DELETE" }))}>
                          ✕
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ShiftForm({ people, companies, departments }: { people: Option[]; companies: Option[]; departments: (Option & { companyId: string })[] }) {
  const t = useTranslations("shifts");
  const { error, pending, run } = useRun();
  const empty = { employeeId: "", start: "", end: "", shiftType: "regular", companyId: "", departmentId: "" };
  const [v, setV] = useState(empty);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, companyId: v.companyId || null, departmentId: v.departmentId || null };
        run(() => api("/shifts", { body }), () => setV({ ...empty, employeeId: v.employeeId, shiftType: v.shiftType }));
      }}
    >
      <ErrorBox error={error} />
      <p className="text-xs text-ink-mute">{t("timezoneHint")}</p>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label={t("employee")}>
          <select className="field" required value={v.employeeId} onChange={set("employeeId")}>
            <option value="" />
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("start")}>
          <input className="field" type="datetime-local" required value={v.start} onChange={set("start")} />
        </Field>
        <Field label={t("end")}>
          <input className="field" type="datetime-local" required value={v.end} onChange={set("end")} />
        </Field>
        <Field label={t("type")}>
          <input className="field" value={v.shiftType} onChange={set("shiftType")} />
        </Field>
        <Field label={t("company")}>
          <select className="field" value={v.companyId} onChange={(e) => setV((s) => ({ ...s, companyId: e.target.value, departmentId: "" }))}>
            <option value="">{t("defaults")}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("department")}>
          <select className="field" value={v.departmentId} onChange={set("departmentId")}>
            <option value="">{t("defaults")}</option>
            {departments
              .filter((d) => !v.companyId || d.companyId === v.companyId)
              .map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
          </select>
        </Field>
      </div>
      <Button disabled={pending}>{t("add")}</Button>
    </form>
  );
}

type ImportResult = { committed: boolean; rows: { line: number; key: string; action: "create" | "unchanged" | "error"; errors: string[] }[]; summary: { create: number; unchanged: number; error: number } };

export function ShiftImport() {
  const t = useTranslations("shifts");
  const router = useRouter();
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const send = (commit: boolean) =>
    start(async () => {
      setError(null);
      try {
        const res = await api<ImportResult>("/shifts/import", { body: { csv, commit } });
        setResult(res);
        if (res.committed) router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-mute">{t("importHint")}</p>
      <input
        type="file"
        accept=".csv,text/csv"
        className="field"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          setResult(null);
          setCsv(f ? await f.text() : "");
        }}
      />
      <ErrorBox error={error} />
      <div className="flex gap-2">
        <Button variant="secondary" disabled={!csv || pending} onClick={() => send(false)}>
          {t("preview")}
        </Button>
        <Button disabled={!result || result.summary.error > 0 || result.summary.create === 0 || result.committed || pending} onClick={() => send(true)}>
          {t("commit")}
        </Button>
      </div>
      {result && (
        <>
          <p className="text-sm">{t("summary", result.summary)}</p>
          <ul className="max-h-48 overflow-auto text-xs">
            {result.rows
              .filter((r) => r.action === "error")
              .map((r) => (
                <li key={r.line} className="text-red-strong">
                  {r.line}: {r.key} — {r.errors.join("; ")}
                </li>
              ))}
          </ul>
        </>
      )}
    </div>
  );
}
