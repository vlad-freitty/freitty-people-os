import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { signOut } from "@/auth";
import { AppShell, type NavGroup, type NavLink } from "@/components/app-shell";
import { getActorOrNull } from "@/server/auth/session";
import { hasPermission, scopeOf } from "@/server/authz/policy";
import { getMe } from "@/server/services/me";
import { unreadCount } from "@/server/services/notifications";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  if (actor.mustChangePassword) redirect("/change-password"); // one-time password (phase 7)
  const me = await getMe(actor);
  const unread = await unreadCount(actor);
  const t = await getTranslations();

  const canSearch = hasPermission(actor, "directory.view") || hasPermission(actor, "employees.view");
  const link = (href: string, key: NavLink["icon"]): NavLink => ({ href, label: t(`nav.${key}`), icon: key });
  const groups: NavGroup[] = [
    {
      label: t("shell.sectionWork"),
      links: [
        link("/", "dashboard"),
        ...(actor.employeeId ? [link("/tasks", "tasks"), link("/requests", "requests"), link("/calendar", "calendar")] : []),
      ],
    },
    {
      label: t("shell.sectionPeople"),
      links: [...(canSearch ? [link("/employees", "employees")] : []), link("/org", "org")],
    },
    {
      label: t("shell.sectionOps"),
      links: [
        ...(scopeOf(actor, "shifts.manage") ? [link("/shifts", "shifts")] : []),
        ...(scopeOf(actor, "payments.manage") === "all" ? [link("/payments", "payments")] : []),
        ...(scopeOf(actor, "templates.manage") ? [link("/templates", "templates")] : []),
        ...(scopeOf(actor, "systems.manage") === "all" ? [link("/systems", "systems")] : []),
        ...(scopeOf(actor, "assets.manage") === "all" ? [link("/assets", "assets")] : []),
      ],
    },
    {
      label: t("shell.sectionAdmin"),
      links: [
        ...(hasPermission(actor, "users.manage") ? [link("/access", "access")] : []),
        ...(hasPermission(actor, "roles.manage") || hasPermission(actor, "roles.assign") ? [link("/roles", "roles")] : []),
        ...(hasPermission(actor, "import.run") ? [link("/import", "import")] : []),
        ...(hasPermission(actor, "audit.view") ? [link("/audit", "audit")] : []),
      ],
    },
  ].filter((g) => g.links.length > 0);
  const footer = scopeOf(actor, "settings.manage") === "all" ? [link("/settings", "settings")] : [];

  return (
    <AppShell
      groups={groups}
      footer={footer}
      user={{ name: me.employee?.name ?? me.email, email: me.email }}
      unread={unread}
      canSearch={canSearch}
      canCreateRequest={Boolean(actor.employeeId)}
      labels={{
        appName: t("common.appName"),
        menu: t("common.menu"),
        close: t("shell.closeMenu"),
        search: t("common.search"),
        searchPlaceholder: t("shell.searchPlaceholder"),
        newRequest: t("shell.newRequest"),
        bell: t("notifications.bell", { n: unread }),
        signOut: t("common.signOut"),
        changePassword: t("password.title"),
      }}
      signOutAction={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      {children}
    </AppShell>
  );
}
