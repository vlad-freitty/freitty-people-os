"use client";

import {
  Cancel01Icon,
  Key01Icon,
  Logout01Icon,
  Menu01Icon,
  Notification02Icon,
  PlusSignIcon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { sectionIcons, type SectionIcon } from "./icons";
import { LocaleToggle } from "./locale-toggle";

const icons = sectionIcons;

export type NavIcon = SectionIcon;
export type NavLink = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string; links: NavLink[] };

type Labels = {
  appName: string;
  menu: string;
  close: string;
  search: string;
  searchPlaceholder: string;
  newRequest: string;
  bell: string;
  signOut: string;
  changePassword: string;
};

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

/**
 * Admin shell from the Figma "Admin - Desktop" page: 218 px navy sidebar with pill links,
 * a white 78 px top bar (search, language, bell) and the #F4F4F4 content area.
 * Below lg the sidebar becomes a drawer opened from the top bar.
 */
export function AppShell({
  groups,
  footer,
  user,
  unread,
  canSearch,
  canCreateRequest,
  labels,
  signOutAction,
  children,
}: {
  groups: NavGroup[];
  footer: NavLink[];
  user: { name: string; email: string };
  unread: number;
  canSearch: boolean;
  canCreateRequest: boolean;
  labels: Labels;
  signOutAction: () => Promise<void>;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const item = (l: NavLink) => {
    const active = isActive(pathname, l.href);
    return (
      <li key={l.href}>
        <Link
          href={l.href}
          aria-current={active ? "page" : undefined}
          className={`flex h-11 items-center gap-2 rounded-full px-3 text-base leading-[1.4] font-medium transition ${active ? "bg-paper text-ink" : "text-white hover:bg-white/10"}`}
        >
          <HugeiconsIcon icon={icons[l.icon]} size={22} strokeWidth={1.5} className="shrink-0" />
          <span className="truncate">{l.label}</span>
        </Link>
      </li>
    );
  };

  const initials = user.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div className="min-h-screen bg-navy lg:flex">
      {open && <div className="fixed inset-0 z-30 bg-navy/40 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[232px] flex-col bg-navy px-3 py-6 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between px-3">
          <Link href="/" aria-label={labels.appName}>
            <Image src="/brand/freitty-logo.svg" alt={labels.appName} width={120} height={36} priority />
          </Link>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={labels.close}
            className="flex size-8 items-center justify-center rounded-full border border-edge bg-cream text-ink lg:hidden"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </button>
        </div>

        {canCreateRequest && (
          <Link
            href="/requests/new"
            className="mt-6 flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-full bg-red px-6 text-sm font-medium text-white transition hover:bg-red-strong"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={18} />
            {labels.newRequest}
          </Link>
        )}

        <nav className="-mx-1 mt-6 flex-1 overflow-y-auto px-1 [scrollbar-color:rgba(255,255,255,0.2)_transparent] [scrollbar-width:thin]">
          {groups.map((g) => (
            <div key={g.label} className="mb-2">
              <p className="flex h-6 items-center px-3 text-xs font-medium tracking-wide text-white/50 uppercase">{g.label}</p>
              <ul className="mt-1 space-y-0.5">{g.links.map(item)}</ul>
            </div>
          ))}
        </nav>

        <div className="mt-4 shrink-0 space-y-2">
          {footer.length > 0 && <ul className="space-y-0.5">{footer.map(item)}</ul>}
          <div className="flex h-[52px] items-center gap-2 rounded-full bg-paper px-1.5">
            <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-cream-deep text-sm font-bold text-ink">
              {initials}
              <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-paper bg-[#17b26a]" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
              <span className="block truncate text-xs text-ink-mute">{user.email}</span>
            </span>
            <Link
              href="/change-password"
              aria-label={labels.changePassword}
              title={labels.changePassword}
              className="flex size-10 shrink-0 items-center justify-center rounded-full border border-edge text-ink-soft transition hover:border-ink hover:text-ink"
            >
              <HugeiconsIcon icon={Key01Icon} size={18} />
            </Link>
            <form action={signOutAction}>
              <button
                type="submit"
                aria-label={labels.signOut}
                title={labels.signOut}
                className="flex size-10 items-center justify-center rounded-full border border-edge text-ink-soft transition hover:border-red hover:text-red"
              >
                <HugeiconsIcon icon={Logout01Icon} size={18} />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col bg-cream">
        <header className="sticky top-0 z-20 flex h-[78px] items-center gap-3 border-b border-line bg-paper px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label={labels.menu}
            aria-expanded={open}
            className="flex size-11 shrink-0 items-center justify-center rounded-full border border-line-strong text-ink lg:hidden"
          >
            <HugeiconsIcon icon={Menu01Icon} size={20} />
          </button>
          {canSearch ? (
            <form action="/employees" role="search" className="relative hidden w-full max-w-[486px] sm:block">
              <HugeiconsIcon icon={Search01Icon} size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-mute" />
              <input
                name="q"
                type="search"
                aria-label={labels.search}
                placeholder={labels.searchPlaceholder}
                className="h-[46px] w-full rounded-full border border-line bg-paper pr-4 pl-11 text-sm text-ink outline-none placeholder:text-ink-mute focus:border-line-strong focus:ring-2 focus:ring-ink/5"
              />
            </form>
          ) : null}
          <div className="ml-auto flex items-center gap-3">
            <LocaleToggle />
            <Link
              href="/notifications"
              aria-label={labels.bell}
              className="relative flex size-11 items-center justify-center rounded-full border border-line-strong bg-paper text-ink transition hover:bg-cream"
            >
              <HugeiconsIcon icon={Notification02Icon} size={20} />
              {unread > 0 && (
                <span className="absolute -top-1 -right-1 min-w-5 rounded-full border-2 border-paper bg-red px-1 text-center text-[10px] leading-4 font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1440px] min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
