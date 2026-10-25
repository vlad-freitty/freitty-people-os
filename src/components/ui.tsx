import { ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

// Figma "Admin - Desktop": 40 px pill buttons, red primary, white secondary with a #D0D5DD border.
const variants: Record<Variant, string> = {
  primary: "bg-red text-white hover:bg-red-strong",
  secondary: "border border-line-strong bg-paper text-[#141b34] hover:bg-cream",
  ghost: "text-ink-soft hover:bg-cream-deep hover:text-ink",
  danger: "border border-red/30 bg-paper text-red hover:bg-red-tint",
};

export function buttonClass(variant: Variant = "primary", extra = "") {
  return `inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${extra}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function LinkButton({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

/** "Усі →" in a card header. */
export function CardLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-red hover:text-red-strong">
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} size={16} />
    </Link>
  );
}

/**
 * Card: optional icon tile + title (+ subtitle) on the left, actions or a "see all" link on the right.
 * Every block of a page is a Card with an icon, so pages read as separate, labelled blocks.
 */
export function Card({
  title,
  subtitle,
  icon,
  tone = "red",
  link,
  actions,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: IconSvgElement;
  tone?: TileTone;
  link?: { href: string; label: ReactNode };
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-card border border-edge bg-paper p-5 shadow-[0_1px_1px_rgba(28,39,76,0.04)] ${className}`}>
      {(title || actions || link) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {icon && <IconTile icon={icon} tone={tone} size={36} />}
            <div className="min-w-0">
              {title && <h2 className="text-base font-bold text-ink-2">{title}</h2>}
              {subtitle && <p className="text-xs text-ink-mute">{subtitle}</p>}
            </div>
          </div>
          {(actions || link) && (
            <div className="flex flex-wrap items-center gap-2">
              {actions}
              {link && <CardLink href={link.href}>{link.label}</CardLink>}
            </div>
          )}
        </header>
      )}
      {children}
    </section>
  );
}

const tones = {
  neutral: "border-line bg-paper text-ink-soft",
  ok: "border-ok/10 bg-ok-tint text-ok",
  warn: "border-warn/10 bg-warn-tint text-warn",
  red: "border-red/10 bg-red-tint text-red",
  ink: "border-navy bg-navy text-white",
};

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`inline-flex h-6 items-center rounded-full border px-2 text-xs font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

/** Page header: the section's icon (same as in the sidebar), title, one-line explanation, page actions. */
export function PageTitle({ children, subtitle, actions, icon }: { children: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: IconSvgElement }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-center gap-4">
        {icon && (
          <span className="hidden sm:block">
            <IconTile icon={icon} tone="navy" size={52} />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-[28px] leading-[1.2] font-medium tracking-[-0.02em] text-ink sm:text-4xl sm:leading-[46px]">{children}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-ink-mute">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const kpiTones = {
  ok: { bar: "border-t-[#18b26a]", icon: "border-[#abefc6] bg-[#ecfdf3] text-ok-strong" },
  warn: { bar: "border-t-warn", icon: "border-[#fedf89] bg-warn-tint text-warn" },
  red: { bar: "border-t-red", icon: "border-[#fecdca] bg-red-tint text-red" },
  blue: { bar: "border-t-blue", icon: "border-[#b2ccff] bg-blue-tint text-blue" },
};

/** KPI card from the design: coloured 3 px top edge, 14 px label, 28 px bold value, 44 px icon circle. */
export function Kpi({ label, value, hint, icon, tone = "ok", href }: { label: ReactNode; value: ReactNode; hint?: ReactNode; icon: IconSvgElement; tone?: keyof typeof kpiTones; href?: string }) {
  const body = (
    <div className={`flex h-full items-center justify-between gap-3 rounded-card border border-t-[3px] border-edge bg-paper p-4 shadow-[0_1px_1px_rgba(28,39,76,0.04)] transition ${kpiTones[tone].bar} ${href ? "hover:shadow-md" : ""}`}>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-ink">{label}</p>
        <p className="mt-1 text-[28px] leading-none font-bold text-ink-2">{value}</p>
        {hint && <p className="mt-1.5 truncate text-xs font-medium text-ink-mute">{hint}</p>}
      </div>
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-full border ${kpiTones[tone].icon}`}>
        <HugeiconsIcon icon={icon} size={22} />
      </span>
    </div>
  );
  return href ? <Link href={href} className="block">{body}</Link> : body;
}

export function Field({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

const tileTones = {
  red: "bg-red-tint text-red",
  blue: "bg-blue-tint text-blue",
  ok: "bg-ok-tint text-ok-strong",
  warn: "bg-warn-tint text-warn",
  neutral: "bg-cream-deep text-ink-soft",
  navy: "bg-navy text-white",
};
export type TileTone = keyof typeof tileTones;

/** 40 px rounded square with an icon — marks what a block or a row is about. */
export function IconTile({ icon, tone = "red", size = 40 }: { icon: IconSvgElement; tone?: TileTone; size?: number }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl ${tileTones[tone]}`} style={{ width: size, height: size }}>
      <HugeiconsIcon icon={icon} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Initials in a circle (no photos in People OS). */
export function Avatar({ name, muted = false }: { name: string; muted?: boolean }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <span className={`flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${muted ? "bg-cream-deep text-ink-mute" : "bg-navy text-white"}`}>
      {initials || "?"}
    </span>
  );
}

/** A dashed block with an icon, a sentence and (optionally) the action that fills it. */
export function EmptyState({ icon, title, hint, action }: { icon: IconSvgElement; title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-line-strong px-6 py-8 text-center">
      <IconTile icon={icon} tone="neutral" />
      <p className="mt-3 text-sm font-bold text-ink-2">{title}</p>
      {hint && <p className="mt-1 max-w-sm text-sm text-ink-mute">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Numbered part of a longer form: "1 · Логін". */
export function FormSection({ n, title, hint, children }: { n?: number | string; title: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="flex items-center gap-2 text-sm font-bold text-ink-2">
        {n !== undefined && <span className="flex size-6 items-center justify-center rounded-full bg-navy text-xs text-white">{n}</span>}
        {title}
      </legend>
      {hint && <p className="-mt-1 text-xs text-ink-mute">{hint}</p>}
      {children}
    </fieldset>
  );
}

/** Inside a card when there is nothing to show — a calm line with an icon, not a bare "Нічого". */
export function Empty({ icon = CheckmarkCircle02Icon, children }: { icon?: IconSvgElement; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 rounded-xl bg-cream px-3.5 py-3 text-sm text-ink-mute">
      <HugeiconsIcon icon={icon} size={18} className="shrink-0" />
      {children}
    </p>
  );
}

/** A list of rows inside a card, separated by thin lines. */
export function List({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`-my-2 divide-y divide-line ${className}`}>{children}</ul>;
}

/** One row: leading element (avatar, icon tile, date), title + subtitle, trailing element (badge, number, date). */
export function ListRow({ href, leading, title, subtitle, trailing }: { href?: string; leading?: ReactNode; title: ReactNode; subtitle?: ReactNode; trailing?: ReactNode }) {
  const body = (
    <span className="flex items-center gap-3 py-2.5">
      {leading}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink-2">{title}</span>
        {subtitle && <span className="block truncate text-xs text-ink-mute">{subtitle}</span>}
      </span>
      {trailing && <span className="shrink-0 text-right">{trailing}</span>}
    </span>
  );
  return (
    <li>
      {href ? (
        <Link href={href} className="-mx-2 block rounded-xl px-2 transition hover:bg-cream">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

/** Calendar-leaf date: day number over a short month (dates in lists of events, shifts, deadlines). */
export function DateLeaf({ iso, locale, tone = "neutral" }: { iso: string; locale: string; tone?: "neutral" | "red" }) {
  const month = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
  return (
    <span className={`flex size-10 shrink-0 flex-col items-center justify-center rounded-xl border leading-none ${tone === "red" ? "border-red/20 bg-red-tint text-red" : "border-line bg-paper text-ink-2"}`}>
      <span className="text-sm font-bold">{Number(iso.slice(8, 10))}</span>
      <span className="mt-0.5 text-[10px] font-medium text-ink-mute uppercase">{month.replace(".", "")}</span>
    </span>
  );
}

/** Heading of a group of cards (dashboard "Моє", "Команда"…). */
export function SectionTitle({ icon, children, hint }: { icon?: IconSvgElement; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon && <HugeiconsIcon icon={icon} size={18} className="text-ink-soft" />}
      <h2 className="text-sm font-bold tracking-wide text-ink-2 uppercase">{children}</h2>
      {hint && <span className="text-xs text-ink-mute">· {hint}</span>}
      <span className="ml-2 h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

/** Small count tile for a page summary row. */
export function Stat({ label, value, tone = "neutral" }: { label: ReactNode; value: ReactNode; tone?: "neutral" | "ok" | "warn" | "red" }) {
  const dot = { neutral: "bg-ink-mute", ok: "bg-ok", warn: "bg-warn", red: "bg-red" }[tone];
  return (
    <div className="rounded-2xl border border-edge bg-paper px-4 py-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-ink-mute">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-1 text-2xl leading-none font-bold text-ink-2">{value}</p>
    </div>
  );
}

export function DefinitionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((item, i) => (
        <div key={i}>
          <dt className="mb-0.5 text-xs font-medium text-ink-mute">{item.label}</dt>
          <dd className="text-sm font-medium text-ink-2">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const statusTone = {
  candidate: "warn",
  onboarding: "warn",
  active: "ok",
  offboarding: "red",
  left: "neutral",
} as const;
