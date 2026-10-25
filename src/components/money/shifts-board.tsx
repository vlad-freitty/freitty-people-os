"use client";

import { Clock01Icon, Delete02Icon, FileImportIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { useModalClose } from "../overlay";
import { Avatar, Badge, Button, Card, DateLeaf, EmptyState, Field, FormSection } from "../ui";

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
  const to = useTranslations("ops2");
  const locale = useLocale();
  const { error, pending, run } = useRun();
  const [selected, setSelected] = useState<string[]>([]);
  const planned = shifts.filter((s) => s.status === "planned").map((s) => s.id);
  const byDate = new Map<string, ShiftDto[]>();
  for (const s of shifts) byDate.set(s.workDate, [...(byDate.get(s.workDate) ?? []), s]);

  return (
    <Card
      icon={Clock01Icon}
      tone="blue"
      title={to("shiftsList")}
      subtitle={to("shiftsCount", { n: shifts.length })}
      actions={
        canManage &&
        planned.length > 0 && (
          <>
            <Button variant="ghost" onClick={() => setSelected(planned)}>
              {t("selectAll")}
            </Button>
            <Button disabled={pending || selected.length === 0} onClick={() => run(() => api("/shifts/confirm", { body: { ids: selected } }), () => setSelected([]))}>
              <HugeiconsIcon icon={Tick02Icon} size={17} />
              {t("confirmSelected")} ({selected.length})
            </Button>
          </>
        )
      }
    >
      <ErrorBox error={error} />
      {shifts.length === 0 ? (
        <EmptyState icon={Clock01Icon} title={t("empty")} hint={to("shiftsEmptyHint")} />
      ) : (
        <div className="-mx-5 overflow-x-auto border-t border-line">
          <table className="table">
            <thead>
              <tr>
                {canManage && <th className="w-8" />}
                <th>{t("date")}</th>
                <th>{t("employee")}</th>
                <th>{to("time")}</th>
                <th>{t("hours")}</th>
                <th className="hidden md:table-cell">{t("type")}</th>
                <th className="hidden md:table-cell">{t("department")}</th>
                <th>{to("status")}</th>
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
                            className="size-4 accent-red"
                            aria-label={s.employee.name}
                            checked={selected.includes(s.id)}
                            onChange={(e) => setSelected((x) => (e.target.checked ? [...x, s.id] : x.filter((id) => id !== s.id)))}
                          />
                        )}
                      </td>
                    )}
                    <td>{i === 0 && <DateLeaf iso={date} locale={locale} />}</td>
                    <td>
                      <span className="flex items-center gap-2.5">
                        <Avatar name={s.employee.name} />
                        <span className="font-medium whitespace-nowrap text-ink-2">{s.employee.name}</span>
                      </span>
                    </td>
                    <td className="font-mono text-xs whitespace-nowrap">
                      {s.start.slice(11)}–{s.end.slice(0, 10) !== s.start.slice(0, 10) && <span className="text-ink-mute">{s.end.slice(5, 10)} </span>}
                      {s.end.slice(11)}
                    </td>
                    <td className="font-bold text-ink-2">{s.hours}</td>
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
                      <td className="text-right">
                        {s.status !== "locked" && (
                          <button
                            type="button"
                            aria-label={t("delete")}
                            title={t("delete")}
                            disabled={pending}
                            className="inline-flex size-8 items-center justify-center rounded-full text-ink-mute transition hover:bg-red-tint hover:text-red disabled:opacity-50"
                            onClick={() => run(() => api(`/shifts/${s.id}`, { method: "DELETE" }))}
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={16} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ShiftForm({ people, companies, departments }: { people: Option[]; companies: Option[]; departments: (Option & { companyId: string })[] }) {
  const t = useTranslations("shifts");
  const to = useTranslations("ops2");
  const tc = useTranslations("common");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const empty = { employeeId: "", start: "", end: "", shiftType: "regular", companyId: "", departmentId: "" };
  const [v, setV] = useState(empty);
  const [added, setAdded] = useState(0);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, companyId: v.companyId || null, departmentId: v.departmentId || null };
        // the dialog stays open: shifts are usually entered one after another for the same person
        run(() => api("/shifts", { body }), () => (setV({ ...empty, employeeId: v.employeeId, shiftType: v.shiftType }), setAdded((n) => n + 1)));
      }}
    >
      <ErrorBox error={error} />
      {added > 0 && (
        <p className="flex items-center gap-2 rounded-2xl bg-ok-tint px-4 py-2.5 text-sm text-ok-strong">
          <HugeiconsIcon icon={Tick02Icon} size={18} />
          {to("shiftAdded", { n: added })}
        </p>
      )}
      <FormSection n={1} title={to("whoAndWhen")} hint={t("timezoneHint")}>
        <Field label={t("employee")}>
          <select className="field" required value={v.employeeId} onChange={set("employeeId")}>
            <option value="">{to("choose")}</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("start")}>
            <input className="field" type="datetime-local" required value={v.start} onChange={set("start")} />
          </Field>
          <Field label={t("end")}>
            <input className="field" type="datetime-local" required value={v.end} onChange={set("end")} />
          </Field>
        </div>
        <Field label={t("type")}>
          <input className="field" value={v.shiftType} onChange={set("shiftType")} />
        </Field>
      </FormSection>
      <FormSection n={2} title={to("costSplit")} hint={to("costSplitHint")}>
        <div className="grid gap-3 sm:grid-cols-2">
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
      </FormSection>
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {added > 0 ? to("done") : tc("cancel")}
          </Button>
        )}
        <Button disabled={pending}>{t("add")}</Button>
      </div>
    </form>
  );
}

type ImportResult = { committed: boolean; rows: { line: number; key: string; action: "create" | "unchanged" | "error"; errors: string[] }[]; summary: { create: number; unchanged: number; error: number } };

export function ShiftImport() {
  const t = useTranslations("shifts");
  const to = useTranslations("ops2");
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
    <div className="space-y-4">
      <p className="rounded-2xl bg-cream px-4 py-3 text-xs text-ink-soft">{t("importHint")}</p>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft hover:bg-cream">
        <HugeiconsIcon icon={FileImportIcon} size={26} className="text-ink-mute" />
        <span className="font-medium text-ink-2">{to("chooseCsv")}</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="max-w-full text-xs"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            setResult(null);
            setCsv(f ? await f.text() : "");
          }}
        />
      </label>
      <ErrorBox error={error} />
      {result && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge tone="ok">{to("importNew", { n: result.summary.create })}</Badge>
            <Badge>{to("importUnchanged", { n: result.summary.unchanged })}</Badge>
            <Badge tone={result.summary.error ? "red" : "neutral"}>{to("importErrors", { n: result.summary.error })}</Badge>
            {result.committed && <Badge tone="ink">{to("importSaved")}</Badge>}
          </div>
          {result.summary.error > 0 && (
            <ul className="max-h-48 space-y-1 overflow-auto rounded-2xl bg-red-tint px-4 py-3 text-xs text-red-strong">
              {result.rows
                .filter((r) => r.action === "error")
                .map((r) => (
                  <li key={r.line}>
                    {r.line}: {r.key} — {r.errors.join("; ")}
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        <Button variant="secondary" disabled={!csv || pending} onClick={() => send(false)}>
          {t("preview")}
        </Button>
        <Button disabled={!result || result.summary.error > 0 || result.summary.create === 0 || result.committed || pending} onClick={() => send(true)}>
          {t("commit")}
        </Button>
      </div>
    </div>
  );
}
