"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Page tabs from the design: underlined row, active tab bold red with a 2 px red underline and a tinted count chip. */
export function NavLinks({ links }: { links: { href: string; label: string; count?: number }[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto border-b border-line text-sm">
      {links.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-[11px] whitespace-nowrap transition ${active ? "border-red font-bold text-red" : "border-transparent font-medium text-[#667085] hover:text-ink"}`}
          >
            {l.label}
            {l.count !== undefined && (
              <span
                className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 text-xs font-medium ${active ? "bg-red-tint text-red" : "border border-line-strong bg-paper text-[#141b34]"}`}
              >
                {l.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
