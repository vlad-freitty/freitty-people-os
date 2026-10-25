"use client";

import { Calendar03Icon, CalendarCheckIn01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = { calendars: Calendar03Icon, absences: CalendarCheckIn01Icon };

/** Settings tabs: icon + label + one-line hint, as two large pills (a phone scrolls them sideways). */
export function SettingsTabs({ tabs }: { tabs: { key: keyof typeof ICONS; href: string; label: string; hint: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
      {tabs.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`flex min-w-60 items-center gap-3 rounded-2xl border px-4 py-3 transition ${active ? "border-navy bg-navy text-white" : "border-edge bg-paper text-ink-2 hover:bg-cream"}`}
          >
            <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${active ? "bg-white/15" : "bg-red-tint text-red"}`}>
              <HugeiconsIcon icon={ICONS[tab.key]} size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold">{tab.label}</span>
              <span className={`block truncate text-xs ${active ? "text-white/70" : "text-ink-mute"}`}>{tab.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
