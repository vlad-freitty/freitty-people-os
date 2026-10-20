import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { devLoginEnabled, entraEnabled, signIn } from "@/auth";
import { Badge, Button } from "@/components/ui";
import { localized } from "@/lib/format";
import { listDevLoginUsers } from "@/server/auth/dev-users";
import { getActorOrNull } from "@/server/auth/session";

const ERRORS = ["not_registered", "inactive"] as const;

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getActorOrNull()) redirect("/");
  const { error } = await searchParams;
  const t = await getTranslations("login");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const devUsers = await listDevLoginUsers();
  const errorKey = error ? ((ERRORS as readonly string[]).includes(error) ? `errors.${error}` : "errors.default") : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8">
        <p className="font-display text-4xl font-semibold tracking-tight">
          <span className="text-red">●</span> {tc("appName")}
        </p>
        <h1 className="mt-4 text-lg font-medium">{t("title")}</h1>
        <p className="text-sm text-ink-soft">{t("subtitle")}</p>
      </div>

      {errorKey && (
        <div role="alert" className="mb-4 rounded-md border border-red/30 bg-red-tint px-3 py-2 text-sm text-red-strong">
          {t(errorKey as "errors.default")}
        </div>
      )}

      <div className="rounded-xl border border-line bg-paper p-5">
        {entraEnabled ? (
          <form
            action={async () => {
              "use server";
              await signIn("microsoft-entra-id", { redirectTo: "/" });
            }}
          >
            <Button type="submit" className="w-full py-2.5">
              {t("microsoft")}
            </Button>
          </form>
        ) : (
          <p className="text-sm text-ink-soft">{t("microsoftNotConfigured")}</p>
        )}
      </div>

      {devLoginEnabled && (
        <div className="mt-6 rounded-xl border border-dashed border-warn/50 bg-warn-tint/40 p-5">
          <h2 className="text-sm font-semibold">{t("devTitle")}</h2>
          <p className="mb-3 text-xs text-ink-soft">{t("devHint")}</p>
          <ul className="divide-y divide-line">
            {devUsers.map((u) => (
              <li key={u.email}>
                <form
                  action={async () => {
                    "use server";
                    await signIn("dev", { email: u.email, redirectTo: "/" });
                  }}
                >
                  <button type="submit" className="flex w-full items-center justify-between gap-3 py-2 text-left text-sm hover:text-red">
                    <span>
                      <span className="font-medium">{u.name}</span>
                      {u.position && <span className="block text-xs text-ink-mute">{u.position}</span>}
                    </span>
                    <Badge tone={u.role.code === "superadmin" ? "ink" : "neutral"}>{localized(locale, u.role.nameUk, u.role.nameEn)}</Badge>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}
