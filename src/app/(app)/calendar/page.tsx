import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarSubscribe } from "@/components/calendar-subscribe";
import { Card, PageTitle } from "@/components/ui";
import { localized } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { isoWeekday, nextIso } from "@/server/calendar/core";
import { calendarView, type CalendarItem } from "@/server/services/calendar";

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  return { first, last };
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const actor = await getActor();
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  // the grid starts on Monday and ends on Sunday
  const gridStart = nextIso(first, -(isoWeekday(first) - 1));
  const gridEnd = nextIso(last, 7 - isoWeekday(last));
  const [view, t, locale] = await Promise.all([calendarView(actor, { from: gridStart, to: gridEnd }), getTranslations("calendar"), getLocale()]);

  const byDate = new Map<string, CalendarItem[]>();
  for (const item of view.items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = nextIso(d)) days.push(d);
  const weekdays = t.raw("weekdays") as string[];
  const monthTitle = new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));

  const label = (i: CalendarItem) => {
    if (i.kind === "birthday") return `🎂 ${i.title}`;
    if (i.kind === "anniversary") return `🎉 ${i.title} · ${t("anniversary", { years: i.years ?? 0 })}`;
    if (i.kind === "absence") return `${i.title} · ${i.titleEn ?? ""}`;
    return localized(locale, i.title, i.titleEn);
  };

  return (
    <>
      <PageTitle
        actions={
          <div className="flex gap-2 text-sm">
            <Link className="rounded-xl bg-paper px-3 py-1.5 hover:bg-cream-deep" href={`/calendar?month=${shiftMonth(month, -1)}`}>
              {t("prev")}
            </Link>
            <Link className="rounded-xl bg-paper px-3 py-1.5 hover:bg-cream-deep" href="/calendar">
              {t("today")}
            </Link>
            <Link className="rounded-xl bg-paper px-3 py-1.5 hover:bg-cream-deep" href={`/calendar?month=${shiftMonth(month, 1)}`}>
              {t("next")}
            </Link>
          </div>
        }
      >
        {t("title")} · <span className="capitalize">{monthTitle}</span>
      </PageTitle>

      {/* phones: a list of days that have something on them (phase 4) */}
      <ul className="space-y-2 sm:hidden">
        {days
          .filter((d) => d >= first && d <= last && (byDate.get(d)?.length ?? 0) > 0)
          .map((d) => (
            <li key={d} className={`rounded-card border bg-paper p-3 ${d === today ? "border-red" : "border-line"}`}>
              <p className="label">{new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))}</p>
              <ul className="space-y-1">
                {(byDate.get(d) ?? []).map((i, n) => (
                  <li key={n} className="flex items-center gap-2 text-sm">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
                    <span className="truncate">{label(i)}</span>
                    {i.nonWorking && <span className="text-xs text-red-strong">· {t("nonWorking")}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-card border border-edge bg-paper sm:block">
        <div className="grid min-w-[720px] grid-cols-7">
          {weekdays.map((w) => (
            <div key={w} className="border-b border-line px-2 py-1.5 text-xs font-medium tracking-wide text-ink-mute uppercase">
              {w}
            </div>
          ))}
          {days.map((d) => {
            const items = byDate.get(d) ?? [];
            const offDay = !view.workWeek.includes(isoWeekday(d)) || items.some((i) => i.nonWorking);
            const outside = d < first || d > last;
            return (
              <div key={d} className={`min-h-24 border-b border-r border-line/70 p-1.5 ${offDay ? "bg-cream/70" : ""} ${outside ? "opacity-45" : ""}`}>
                <div className={`mb-1 text-xs ${d === today ? "inline-block rounded-full bg-red px-1.5 font-semibold text-white" : "text-ink-soft"}`}>{Number(d.slice(8))}</div>
                <ul className="space-y-0.5">
                  {items.map((i, n) => (
                    <li
                      key={n}
                      className="truncate rounded px-1 text-[11px] leading-4"
                      style={{ backgroundColor: `${i.color}22`, color: i.color }}
                      title={`${label(i)}${i.nonWorking ? ` · ${t("nonWorking")}` : ""}`}
                    >
                      {label(i)}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={t("layers")}>
          <ul className="space-y-1.5 text-sm">
            {view.layers.map((l) => (
              <li key={l.id} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: l.color }} />
                {localized(locale, l.nameUk, l.nameEn)}
                {l.assigned && <span className="text-xs text-ink-mute">· {t("mine")}</span>}
                {l.effect === "non_working" && l.assigned && <span className="text-xs text-red-strong">· {t("nonWorking")}</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card title={t("subscribe")}>
          <CalendarSubscribe />
        </Card>
      </div>
    </>
  );
}
