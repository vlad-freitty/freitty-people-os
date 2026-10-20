"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

/** Phone navigation: a menu button with the full list instead of a long scrolling row (phase 4). */
export function MobileNav({ links, label }: { links: { href: string; label: string }[]; label: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const current = links.find((l) => (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href)));
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-line bg-paper px-3 py-1.5 text-sm"
      >
        <span aria-hidden>☰</span>
        <span>{current?.label ?? label}</span>
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full z-20 border-b border-line bg-cream px-4 py-3 shadow-lg">
          <ul className="grid grid-cols-2 gap-1">
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link href={l.href} className={`block rounded-md px-3 py-2 text-sm ${active ? "bg-ink text-cream" : "bg-paper hover:bg-cream-deep"}`}>
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
