"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { formatDate } from "@/lib/format";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { Badge, Button, Field } from "../ui";

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
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, nameEn: v.nameEn || null };
        run(() => (layer ? api(`/settings/layers/${layer.id}`, { method: "PATCH", body }) : api("/settings/layers", { body })), () => !layer && setV((s) => ({ ...s, nameUk: "", nameEn: "" })));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-2 sm:grid-cols-[2fr_2fr_auto_1.5fr_1.5fr]">
        <input className="field" required placeholder={t("name")} value={v.nameUk} onChange={set("nameUk")} />
        <input className="field" placeholder={t("nameEn")} value={v.nameEn} onChange={set("nameEn")} />
        <input className="field h-10 w-14 p-1" type="color" value={v.color} onChange={set("color")} aria-label={t("color")} />
        <select className="field" value={v.effect} onChange={set("effect")} disabled={!!layer?.systemKind} aria-label={t("effect")}>
          {(["non_working", "informational"] as const).map((x) => (
            <option key={x} value={x}>
              {t(`effects.${x}`)}
            </option>
          ))}
        </select>
        <select className="field" value={v.visibility} onChange={set("visibility")} aria-label={t("visibility")}>
          {(["all", "assigned_only"] as const).map((x) => (
            <option key={x} value={x}>
              {t(`visibilities.${x}`)}
            </option>
          ))}
        </select>
      </div>
      <Button disabled={pending} variant={layer ? "secondary" : "primary"}>
        {layer ? t("commit") : t("newLayer")}
      </Button>
    </form>
  );
}

export function AssignmentsEditor({ layer, org }: { layer: LayerDto; org: OrgOptions }) {
  const t = useTranslations("settings");
  const { error, pending, run } = useRun();
  const [selected, setSelected] = useState<Target[]>(layer.assignments);
  const has = (tt: Target["targetType"], id: string) => selected.some((s) => s.targetType === tt && s.targetId === id);
  const toggle = (tt: Target["targetType"], id: string, on: boolean) =>
    setSelected((s) => (on ? [...s, { targetType: tt, targetId: id }] : s.filter((x) => !(x.targetType === tt && x.targetId === id))));
  const group = (title: string, tt: Target["targetType"], options: Option[]) => (
    <div>
      <p className="label">{title}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {options.map((o) => (
          <label key={o.id} className="flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={has(tt, o.id)} onChange={(e) => toggle(tt, o.id, e.target.checked)} />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  );
  return (
    <div className="space-y-3">
      <ErrorBox error={error} />
      {group(t("companies"), "company", org.companies)}
      {group(t("departments"), "department", org.departments)}
      {group(t("locations"), "location", org.locations)}
      <Button variant="secondary" disabled={pending} onClick={() => run(() => api(`/settings/layers/${layer.id}/assignments`, { method: "PUT", body: selected }))}>
        {t("commit")}
      </Button>
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
        <ul className="max-h-72 space-y-1 overflow-auto text-sm">
          {events.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 border-b border-line/60 py-1">
              <span>
                {formatDate(e.date, locale)}
                {e.endDate && <> — {formatDate(e.endDate, locale)}</>} · {e.titleUk}
                {e.recurrence === "yearly" && <span className="text-xs text-ink-mute"> · {t("yearly")}</span>}
                {e.nonWorking !== null && <span className="text-xs text-ink-mute"> · {t("nonWorkingOverride")}: {e.nonWorking ? tc("yes") : tc("no")}</span>}
              </span>
              <Button variant="ghost" className="px-2 py-0.5 text-xs" disabled={pending} onClick={() => run(() => api(`/settings/layers/${layerId}/events/${e.id}`, { method: "DELETE" }), () => setReload((x) => x + 1))}>
                ✕
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="grid gap-2 sm:grid-cols-[2fr_2fr_1fr_1fr_auto_1fr]"
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
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={v.yearly} onChange={(e) => setV({ ...v, yearly: e.target.checked })} />
          {t("yearly")}
        </label>
        <select className="field" value={v.nonWorking} onChange={(e) => setV({ ...v, nonWorking: e.target.value })} aria-label={t("nonWorkingOverride")}>
          <option value="">{t("inherit")}</option>
          <option value="yes">{t("nonWorkingOverride")}: {tc("yes")}</option>
          <option value="no">{t("nonWorkingOverride")}: {tc("no")}</option>
        </select>
        <Button disabled={pending} className="sm:col-span-6 sm:justify-self-start">
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
    <details className="rounded-lg border border-line p-3">
      <summary className="cursor-pointer text-sm font-medium">{t("import")}</summary>
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
          <textarea className="field min-h-24 font-mono text-xs" value={content} onChange={(e) => (setContent(e.target.value), setResult(null))} />
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
    <div className="flex flex-wrap items-center gap-3 border-b border-line/60 py-2 text-sm">
      <span className="w-40 font-medium">{label}</span>
      {DAYS.map((d) => (
        <label key={d} className="flex items-center gap-1">
          <input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays((s) => (e.target.checked ? [...s, d].sort() : s.filter((x) => x !== d)))} />
          {weekdays[d - 1]}
        </label>
      ))}
      <Button variant="ghost" className="py-1 text-xs" disabled={pending || days.length === 0} onClick={() => run(() => api("/settings/work-weeks", { method: "PUT", body: { ...target, days } }))}>
        {t("commit")}
      </Button>
      <ErrorBox error={error} />
    </div>
  );
}
