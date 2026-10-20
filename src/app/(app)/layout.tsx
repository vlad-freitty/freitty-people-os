import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/auth";
import { LocaleToggle } from "@/components/locale-toggle";
import { MobileNav } from "@/components/mobile-nav";
import { NavLinks } from "@/components/nav-links";
import { getActorOrNull } from "@/server/auth/session";
import { hasPermission, scopeOf } from "@/server/authz/policy";
import { getMe } from "@/server/services/me";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  const me = await getMe(actor);
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
