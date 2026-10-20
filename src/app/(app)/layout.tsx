import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/auth";
import { LocaleToggle } from "@/components/locale-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { NavLinks } from "@/components/nav-links";
import { getActorOrNull } from "@/server/auth/session";
import { hasPermission, scopeOf } from "@/server/authz/policy";
import { getMe } from "@/server/services/me";
import { unreadCount } from "@/server/services/notifications";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  const me = await getMe(actor);
  const unread = await unreadCount(actor);
  const t = await getTranslations();

  const links = [
    { href: "/", label: t("nav.dashboard") },
    ...(actor.employeeId ? [{ href: "/tasks", label: t("nav.tasks") }, { href: "/requests", label: t("nav.requests") }, { href: "/calendar", label: t("nav.calendar") }] : []),
    ...(hasPermission(actor, "directory.view") || hasPermission(actor, "employees.view") ? [{ href: "/employees", label: t("nav.employees") }] : []),
    { href: "/org", label: t("nav.org") },
    ...(scopeOf(actor, "shifts.manage") ? [{ href: "/shifts", label: t("nav.shifts") }] : []),
    ...(scopeOf(actor, "payments.manage") === "all" ? [{ href: "/payments", label: t("nav.payments") }] : []),
    ...(scopeOf(actor, "templates.manage") ? [{ href: "/templates", label: t("nav.templates") }] : []),
    ...(scopeOf(actor, "systems.manage") === "all" ? [{ href: "/systems", label: t("nav.systems") }] : []),
    ...(scopeOf(actor, "assets.manage") === "all" ? [{ href: "/assets", label: t("nav.assets") }] : []),
    ...(hasPermission(actor, "roles.manage") || hasPermission(actor, "roles.assign") ? [{ href: "/roles", label: t("nav.roles") }] : []),
    ...(hasPermission(actor, "import.run") ? [{ href: "/import", label: t("nav.import") }] : []),
    ...(scopeOf(actor, "settings.manage") === "all" ? [{ href: "/settings", label: t("nav.settings") }] : []),
    ...(hasPermission(actor, "audit.view") ? [{ href: "/audit", label: t("nav.audit") }] : []),
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-cream/90 backdrop-blur">
        <div className="relative mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
          <span className="font-display text-xl font-semibold">
            <span className="text-red">●</span> {t("common.appName")}
          </span>
          <MobileNav links={links} label={t("common.menu")} />
          <div className="hidden md:block md:flex-1">
            <NavLinks links={links} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link href="/notifications" aria-label={t("notifications.bell", { n: unread })} className="relative rounded-md px-1.5 py-1 hover:bg-cream-deep">
              <span aria-hidden>🔔</span>
              {unread > 0 && <span className="absolute -top-1 -right-1 min-w-4 rounded-full bg-red px-1 text-center text-[10px] font-semibold leading-4 text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <LocaleToggle />
            <span className="hidden text-sm text-ink-soft md:inline">{me.employee?.name ?? me.email}</span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className="text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                {t("common.signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
