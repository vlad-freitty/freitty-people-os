import { ArrowLeft01Icon, ArrowRight01Icon, Award01Icon, BirthdayCakeIcon, Calendar03Icon, Home01Icon, Layers01Icon, Link01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { CalendarSubscribe } from "@/components/calendar-subscribe";
import { sectionIcons } from "@/components/icons";
import { buttonClass, Card, DateLeaf, EmptyState, PageTitle } from "@/components/ui";
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

/** Icon of an item kind (instead of emoji); events and ordinary absences get a coloured dot. */
function kindIcon(i: CalendarItem): IconSvgElement | null {
  if (i.kind === "birthday") return BirthdayCakeIcon;
  if (i.kind === "anniversary") return Award01Icon;
  if (i.kind === "absence" && i.remote) return Home01Icon;
  return null;
}

function ItemMark({ item, size = 12 }: { item: CalendarItem; size?: number }) {
  const icon = kindIcon(item);
  return icon ? (
    <HugeiconsIcon icon={icon} size={size} className="shrink-0" style={{ color: item.color }} />
  ) : (
    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
  );
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
  const [view, t, locale] = await Promise.all([calendarView(actor, { from: gridStart, to: gridEnd }), getTranslations(), getLocale()]);
  const intlLocale = locale === "uk" ? "uk-UA" : "en-US";

  const byDate = new Map<string, CalendarItem[]>();
  for (const item of view.items) byDate.set(item.date, [...(byDate.get(item.date) ?? []), item]);
  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = nextIso(d)) days.push(d);
  const weekdays = t.raw("calendar.weekdays") as string[];
  const monthTitle = new Intl.DateTimeFormat(intlLocale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));
  const isCurrentMonth = month === today.slice(0, 7);
  const phoneDays = days.filter((d) => d >= first && d <= last && (byDate.get(d)?.length ?? 0) > 0);

  const label = (i: CalendarItem) => {
    if (i.kind === "anniversary") return `${i.title} · ${t("calendar.anniversary", { years: i.years ?? 0 })}`;
    if (i.kind === "absence") return `${i.title} · ${localized(locale, i.typeUk ?? i.titleEn ?? "", i.titleEn)}`;
    if (i.kind === "event") return localized(locale, i.title, i.titleEn);
    return i.title;
  };

  const legend: { icon?: IconSvgElement; dot?: string; label: string }[] = [
    { icon: BirthdayCakeIcon, label: t("calendar.birthday") },
    { icon: Award01Icon, label: t("people2.anniversary") },
    { dot: "bg-ink-mute", label: t("calendar.absence") },
    { icon: Home01Icon, label: t("people2.remote") },
  ];

  return (
    <>
      <PageTitle
        icon={sectionIcons.calendar}
        subtitle={t("people2.calendarSubtitle")}
        actions={
          <div className="flex items-center gap-2">
            <Link
              aria-label={t("calendar.prev")}
              title={t("calendar.prev")}
              className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-soft transition hover:bg-cream hover:text-ink"
              href={`/calendar?month=${shiftMonth(month, -1)}`}
            >
              <HugeiconsIcon icon={ArrowLeft01Icon} size={18} />
            </Link>
            <span className="min-w-36 text-center text-sm font-bold text-ink-2 capitalize">{monthTitle}</span>
            <Link
              aria-label={t("calendar.next")}
              title={t("calendar.next")}
              className="flex size-10 items-center justify-center rounded-full border border-line-strong bg-paper text-ink-soft transition hover:bg-cream hover:text-ink"
              href={`/calendar?month=${shiftMonth(month, 1)}`}
            >
              <HugeiconsIcon icon={ArrowRight01Icon} size={18} />
            </Link>
            {!isCurrentMonth && (
              <Link className={buttonClass("secondary")} href="/calendar">
                {t("calendar.today")}
              </Link>
            )}
          </div>
        }
      >
        {t("calendar.title")}
      </PageTitle>

      {/* legend */}
      <ul className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-soft">
        {legend.map((l) => (
          <li key={l.label} className="flex items-center gap-1.5">
            {l.icon ? <HugeiconsIcon icon={l.icon} size={14} className="text-ink-soft" /> : <span className={`size-2 rounded-full ${l.dot}`} />}
            {l.label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span className="size-3 rounded border border-line bg-cream" />
          {t("calendar.nonWorking")}
        </li>
        <li className="flex items-center gap-1.5">
          <span className="flex size-4 items-center justify-center rounded-full bg-red text-[9px] font-bold text-white">1</span>
          {t("calendar.today")}
        </li>
      </ul>

      {/* phones: a list of days that have something on them (phase 4) */}
      <div className="sm:hidden">
        {phoneDays.length === 0 ? (
          <EmptyState icon={Calendar03Icon} title={t("people2.noEventsMonth")} />
        ) : (
          <ul className="space-y-2">
            {phoneDays.map((d) => (
              <li key={d} className={`flex gap-3 rounded-card border bg-paper p-3 ${d === today ? "border-red" : "border-edge"}`}>
                <DateLeaf iso={d} locale={locale} tone={d === today ? "red" : "neutral"} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-ink-mute capitalize">
                    {new Intl.DateTimeFormat(intlLocale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`))}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {(byDate.get(d) ?? []).map((i, n) => (
                      <li key={n} className="flex items-center gap-2 text-sm text-ink-2">
                        <ItemMark item={i} size={14} />
                        <span className="truncate">{label(i)}</span>
                        {i.nonWorking && <span className="shrink-0 text-xs text-red-strong">· {t("calendar.nonWorking")}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="hidden overflow-x-auto rounded-card border border-edge bg-paper shadow-[0_1px_1px_rgba(28,39,76,0.04)] sm:block">
        <div className="grid min-w-[720px] grid-cols-7">
          {weekdays.map((w, n) => (
            <div key={w} className={`border-b border-line bg-table-head px-3 py-2.5 text-xs font-bold tracking-wide uppercase ${n >= 5 ? "text-red" : "text-ink-soft"}`}>
              {w}
            </div>
          ))}
          {days.map((d) => {
            const items = byDate.get(d) ?? [];
            const offDay = !view.workWeek.includes(isoWeekday(d)) || items.some((i) => i.nonWorking);
            const outside = d < first || d > last;
            const isToday = d === today;
            return (
              <div
                key={d}
                className={`min-h-28 border-r border-b border-line/70 p-2 [&:nth-child(7n)]:border-r-0 ${offDay ? "bg-cream/70" : ""} ${outside ? "opacity-40" : ""} ${isToday ? "bg-red-tint/40 ring-2 ring-red ring-inset" : ""}`}
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span
                    className={`flex size-6 items-center justify-center rounded-full text-xs ${isToday ? "bg-red font-bold text-white" : offDay ? "font-medium text-red-strong" : "font-medium text-ink-soft"}`}
                  >
                    {Number(d.slice(8))}
                  </span>
                  {items.length > 3 && <span className="text-[10px] font-medium text-ink-mute">{items.length}</span>}
                </div>
                <ul className="space-y-1">
                  {items.map((i, n) => (
                    <li
                      key={n}
                      className="flex items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium"
                      style={{ backgroundColor: `${i.color}1f`, color: i.color }}
                      title={`${label(i)}${i.nonWorking ? ` · ${t("calendar.nonWorking")}` : ""}`}
                    >
                      <ItemMark item={i} size={11} />
                      <span className="truncate">{label(i)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card icon={Layers01Icon} tone="blue" title={t("calendar.layers")} subtitle={t("people2.layersHint")}>
          <ul className="-my-2 divide-y divide-line">
            {view.layers.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2.5 text-sm">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                <span className="min-w-0 flex-1 truncate font-medium text-ink-2">{localized(locale, l.nameUk, l.nameEn)}</span>
                {l.assigned && <span className="rounded-full bg-cream px-2 py-0.5 text-xs text-ink-soft">{t("calendar.mine")}</span>}
                {l.effect === "non_working" && l.assigned && <span className="rounded-full bg-red-tint px-2 py-0.5 text-xs text-red-strong">{t("calendar.nonWorking")}</span>}
              </li>
            ))}
          </ul>
        </Card>
        <Card icon={Link01Icon} tone="neutral" title={t("calendar.subscribe")}>
          <CalendarSubscribe />
        </Card>
      </div>
    </>
  );
}
