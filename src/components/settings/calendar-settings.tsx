"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Building03Icon, CalendarAdd01Icon, Delete02Icon, FileImportIcon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { formatDate } from "@/lib/format";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { useModalClose } from "../overlay";
import { Badge, Button, DateLeaf, Field } from "../ui";
import { ColorInput, DialogActions, Toggle } from "./absence-settings";

type Target = { targetType: "company" | "department" | "location" | "employee"; targetId: string };
export type LayerDto = {
  id: string;
  nameUk: string;
  nameEn: string | null;
  color: string;
  effect: "non_working" | "informational";
  source: string;
  systemKind: string | null;
  visibility: "all" | "assigned_only";
  eventCount: number;
  assignments: Target[];
};
type Option = { id: string; label: string };
export type OrgOptions = { companies: Option[]; departments: Option[]; locations: Option[] };

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

export function LayerForm({ layer }: { layer?: LayerDto }) {
  const t = useTranslations("settings");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [v, setV] = useState({
    nameUk: layer?.nameUk ?? "",
    nameEn: layer?.nameEn ?? "",
    color: layer?.color ?? "#2563eb",
    effect: layer?.effect ?? "non_working",
    visibility: layer?.visibility ?? "assigned_only",
  });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, nameEn: v.nameEn || null };
        run(() => (layer ? api(`/settings/layers/${layer.id}`, { method: "PATCH", body }) : api("/settings/layers", { body })), () => close?.());
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("name")}>
          <input className="field" required autoFocus value={v.nameUk} onChange={set("nameUk")} />
        </Field>
        <Field label={t("nameEn")}>
          <input className="field" value={v.nameEn} onChange={set("nameEn")} />
        </Field>
        <Field label={t("color")}>
          <ColorInput value={v.color} onChange={(color) => setV((s) => ({ ...s, color }))} label={t("color")} />
        </Field>
        <Field label={t("effect")}>
          <select className="field" value={v.effect} onChange={set("effect")} disabled={!!layer?.systemKind}>
            {(["non_working", "informational"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`effects.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("visibility")}>
          <select className="field" value={v.visibility} onChange={set("visibility")}>
            {(["all", "assigned_only"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`visibilities.${x}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <DialogActions pending={pending} label={layer ? t("commit") : t("newLayer")} />
    </form>
  );
}

export function AssignmentsEditor({ layer, org }: { layer: LayerDto; org: OrgOptions }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [selected, setSelected] = useState<Target[]>(layer.assignments);
  const has = (tt: Target["targetType"], id: string) => selected.some((s) => s.targetType === tt && s.targetId === id);
  const toggle = (tt: Target["targetType"], id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, { targetType: tt, targetId: id }] : s.filter((x) => !(x.targetType === tt && x.targetId === id))));
  const group = (title: string, tt: Target["targetType"], options: Option[]) => (
    <div>
      <p className="label">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = has(tt, o.id);
          return (
            <label
              key={o.id}
              className={`flex cursor-pointer items-center rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/20 ${on ? "border-navy bg-navy text-white" : "border-line-strong text-ink-soft hover:bg-cream"}`}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={(e) => toggle(tt, o.id, e.target.checked)} />
              {o.label}
            </label>
          );
        })}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {group(t("companies"), "company", org.companies)}
      {group(t("departments"), "department", org.departments)}
      {group(t("locations"), "location", org.locations)}
      <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
        {close && (
          <Button type="button" variant="secondary" onClick={close}>
            {tc("cancel")}
          </Button>
        )}
        <Button disabled={pending} onClick={() => run(() => api(`/settings/layers/${layer.id}/assignments`, { method: "PUT", body: selected }), () => close?.())}>
          {t("commit")}
        </Button>
      </div>
    </div>
  );
}

type EventDto = { id: string; titleUk: string; titleEn: string | null; date: string; endDate: string | null; recurrence: "none" | "yearly"; nonWorking: boolean | null };

export function EventsEditor({ layerId }: { layerId: string }) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [events, setEvents] = useState<EventDto[] | null>(null);
  const [reload, setReload] = useState(0);
  const { error, pending, run } = useRun();
  const empty = { titleUk: "", titleEn: "", date: "", endDate: "", yearly: false, nonWorking: "" };
  const [v, setV] = useState(empty);

  useEffect(() => {
    api<EventDto[]>(`/settings/layers/${layerId}/events`).then(setEvents, () => setEvents([]));
  }, [layerId, reload]);

  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {events === null ? (
        <p className="text-sm text-ink-mute">{tc("loading")}</p>
      ) : (
        <ul className="max-h-72 divide-y divide-line overflow-auto rounded-2xl border border-line">
          {events.length === 0 && <li className="px-4 py-3 text-sm text-ink-mute">{tc("noResults")}</li>}
          {events.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-3 py-2">
              <DateLeaf iso={e.date} locale={locale} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-2">{e.titleUk}</span>
                <span className="block truncate text-xs text-ink-mute">
                  {formatDate(e.date, locale)}
                  {e.endDate && <> — {formatDate(e.endDate, locale)}</>}
                  {e.recurrence === "yearly" && <> · {t("yearly")}</>}
                  {e.nonWorking !== null && (
                    <>
                      {" "}
                      · {t("nonWorkingOverride")}: {e.nonWorking ? tc("yes") : tc("no")}
                    </>
                  )}
                </span>
              </span>
              <button
                type="button"
                aria-label={tc("delete")}
                title={tc("delete")}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-ink-mute hover:bg-red-tint hover:text-red disabled:opacity-50"
                disabled={pending}
                onClick={() => run(() => api(`/settings/layers/${layerId}/events/${e.id}`, { method: "DELETE" }), () => setReload((x) => x + 1))}
              >
                <HugeiconsIcon icon={Delete02Icon} size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 rounded-2xl bg-cream p-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const body = {
            titleUk: v.titleUk,
            titleEn: v.titleEn || null,
            date: v.date,
            endDate: v.endDate || null,
            recurrence: v.yearly ? "yearly" : "none",
            nonWorking: v.nonWorking === "" ? null : v.nonWorking === "yes",
          };
          run(() => api(`/settings/layers/${layerId}/events`, { body }), () => (setV(empty), setReload((x) => x + 1)));
        }}
      >
        <input className="field" required placeholder={t("eventTitle")} value={v.titleUk} onChange={(e) => setV({ ...v, titleUk: e.target.value })} />
        <input className="field" placeholder={t("eventTitleEn")} value={v.titleEn} onChange={(e) => setV({ ...v, titleEn: e.target.value })} />
        <input className="field" required type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} aria-label={t("date")} />
        <input className="field" type="date" value={v.endDate} onChange={(e) => setV({ ...v, endDate: e.target.value })} aria-label={t("endDate")} />
        <Toggle checked={v.yearly} onChange={(yearly) => setV({ ...v, yearly })}>
          {t("yearly")}
        </Toggle>
        <select className="field" value={v.nonWorking} onChange={(e) => setV({ ...v, nonWorking: e.target.value })} aria-label={t("nonWorkingOverride")}>
          <option value="">{t("inherit")}</option>
          <option value="yes">{t("nonWorkingOverride")}: {tc("yes")}</option>
          <option value="no">{t("nonWorkingOverride")}: {tc("no")}</option>
        </select>
        <Button disabled={pending} className="sm:col-span-2 sm:justify-self-start">
          <HugeiconsIcon icon={CalendarAdd01Icon} size={17} />
          {t("addEvent")}
        </Button>
      </form>
      <ImportBox layerId={layerId} onDone={() => setReload((x) => x + 1)} />
    </div>
  );
}

type ImportResult = {
  committed: boolean;
  rows: { line: number; titleUk: string; date: string; action: "create" | "duplicate" | "error"; errors: string[] }[];
  summary: { create: number; duplicate: number; error: number };
};

function ImportBox({ layerId, onDone }: { layerId: string; onDone: () => void }) {
  const t = useTranslations("settings");
  const [format, setFormat] = useState<"ics" | "csv">("ics");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const send = (commit: boolean) =>
    start(async () => {
      setError(null);
      try {
        const res = await api<ImportResult>(`/settings/layers/${layerId}/import`, { body: { format, content, commit } });
        setResult(res);
        if (res.committed) onDone();
      } catch (err) {
        setError(err);
      }
    });
  return (
    <details className="rounded-2xl border border-line p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-ink-2">
        <HugeiconsIcon icon={FileImportIcon} size={17} className="text-ink-soft" />
        {t("import")}
      </summary>
      <div className="mt-3 space-y-2">
        <p className="text-xs text-ink-mute">{t("importHint")}</p>
        <div className="flex flex-wrap gap-2">
          <select className="field max-w-28" value={format} onChange={(e) => setFormat(e.target.value as "ics" | "csv")} aria-label={t("source")}>
            <option value="ics">{t("sources.ics_import")}</option>
            <option value="csv">{t("sources.csv_import")}</option>
          </select>
          <input
            type="file"
            accept=".ics,.csv,text/calendar,text/csv"
            className="field max-w-xs"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setContent(await f.text());
              setFormat(f.name.toLowerCase().endsWith(".csv") ? "csv" : "ics");
              setResult(null);
            }}
          />
        </div>
        <Field label={t("importContent")}>
          <textarea className="field min-h-24 font-mono text-xs!" value={content} onChange={(e) => (setContent(e.target.value), setResult(null))} />
        </Field>
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!content || pending} onClick={() => send(false)}>
            {t("preview")}
          </Button>
          <Button disabled={!result || result.summary.error > 0 || result.summary.create === 0 || result.committed || pending} onClick={() => send(true)}>
            {t("commit")}
          </Button>
        </div>
        {result && (
          <>
            <p className="text-sm">{t("importSummary", result.summary)}</p>
            <ul className="max-h-48 overflow-auto text-xs">
              {result.rows.map((r) => (
                <li key={r.line} className={r.action === "error" ? "text-red-strong" : ""}>
                  <Badge tone={r.action === "create" ? "ok" : r.action === "duplicate" ? "neutral" : "red"}>{r.line}</Badge> {r.date} {r.titleUk} {r.errors.join("; ")}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}

const DAYS = [1, 2, 3, 4, 5, 6, 7];

export function WorkWeekEditor({ target, label, initial, weekdays }: { target: { locationId?: string; companyId?: string }; label: string; initial: number[]; weekdays: string[] }) {
  const t = useTranslations("settings");
  const { error, pending, run } = useRun();
  const [days, setDays] = useState(initial);
  return (
    <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
      <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-ink-2 sm:w-48">
        <HugeiconsIcon icon={target.locationId ? Location01Icon : Building03Icon} size={16} className="shrink-0 text-ink-mute" />
        <span className="truncate">{label}</span>
      </span>
      <span className="flex flex-wrap gap-1">
        {DAYS.map((d) => {
          const on = days.includes(d);
          return (
            <label
              key={d}
              className={`flex size-9 cursor-pointer items-center justify-center rounded-full border text-xs font-medium transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ink/20 ${on ? "border-navy bg-navy text-white" : "border-line-strong text-ink-mute hover:bg-cream"}`}
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={(e) => setDays((s) => (e.target.checked ? [...s, d].sort() : s.filter((x) => x !== d)))} />
              {weekdays[d - 1]}
            </label>
          );
        })}
      </span>
      <Button variant="secondary" className="sm:ml-auto" disabled={pending || days.length === 0} onClick={() => run(() => api("/settings/work-weeks", { method: "PUT", body: { ...target, days } }))}>
        {t("commit")}
      </Button>
      <ErrorBox error={error} />
    </div>
  );
}
