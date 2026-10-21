import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import { redirect } from "next/navigation";
import { devLoginEnabled, entraEnabled, signIn } from "@/auth";
import { Badge, Button } from "@/components/ui";
import { localized } from "@/lib/format";
import { listDevLoginUsers } from "@/server/auth/dev-users";
import { getActorOrNull } from "@/server/auth/session";

const ERRORS = ["not_registered", "inactive"] as const;

/** Sign-in from the Figma "Admin - Desktop" page: brand panel on the left, form column on the right. */
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getActorOrNull()) redirect("/");
  const { error } = await searchParams;
  const t = await getTranslations("login");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const devUsers = await listDevLoginUsers();
  const errorKey = error ? ((ERRORS as readonly string[]).includes(error) ? `errors.${error}` : "errors.default") : null;

  return (
    <main className="flex min-h-screen bg-paper p-4 lg:p-6">
      <aside className="relative hidden w-[min(46%,610px)] shrink-0 flex-col justify-between overflow-hidden rounded-3xl bg-navy p-10 text-white lg:sticky lg:top-6 lg:flex lg:h-[calc(100vh-3rem)]">
        <Image src="/brand/freitty-logo.svg" alt={tc("appName")} width={120} height={36} priority />
        <div aria-hidden className="absolute -right-24 top-1/3 size-80 rounded-full bg-red/90 blur-[2px]" />
        <div aria-hidden className="absolute -right-6 top-[44%] size-40 rounded-full border-[18px] border-white/10" />
        <div className="relative max-w-sm">
          <p className="text-[32px] leading-tight font-bold tracking-[-0.02em]">{t("panelTitle")}</p>
          <p className="mt-3 text-sm text-white/70">{t("panelText")}</p>
        </div>
      </aside>

      <div className="flex flex-1 items-center justify-center px-2 py-10 sm:px-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <span className="inline-flex rounded-2xl bg-navy px-4 py-3">
              <Image src="/brand/freitty-logo.svg" alt={tc("appName")} width={100} height={30} priority />
            </span>
          </div>
          <h1 className="text-4xl leading-tight font-bold tracking-[-0.02em] text-ink">{t("welcome")}</h1>
          <p className="mt-2 text-sm text-ink-mute">
            {t("title")} · {t("subtitle")}
          </p>

          {errorKey && (
            <div role="alert" className="mt-6 rounded-xl border border-red/30 bg-red-tint px-3 py-2 text-sm text-red-strong">
              {t(errorKey as "errors.default")}
            </div>
          )}

          <div className="mt-8">
            {entraEnabled ? (
              <form
                action={async () => {
                  "use server";
                  await signIn("microsoft-entra-id", { redirectTo: "/" });
                }}
              >
                <Button type="submit" className="h-12 w-full">
                  {t("microsoft")}
                </Button>
              </form>
            ) : (
              <p className="rounded-xl border border-line bg-cream px-4 py-3 text-sm text-ink-soft">{t("microsoftNotConfigured")}</p>
            )}
          </div>

          {devLoginEnabled && (
            <div className="mt-8 rounded-card border border-dashed border-warn/50 bg-warn-tint/40 p-5">
              <h2 className="text-xs font-medium tracking-wide text-ink uppercase">{t("devTitle")}</h2>
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
        </div>
      </div>
    </main>
  );
}
