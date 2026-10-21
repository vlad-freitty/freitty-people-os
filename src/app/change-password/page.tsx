import { getTranslations } from "next-intl/server";
import Image from "next/image";
import { redirect } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/server/auth/password";
import { getActorOrNull } from "@/server/auth/session";
import { ChangePasswordForm } from "./form";

/** Password change — forced after a one-time password (phase 7), also reachable from the profile. */
export default async function ChangePasswordPage() {
  const actor = await getActorOrNull();
  if (!actor) redirect("/login");
  const t = await getTranslations("password");
  const tc = await getTranslations("common");
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-10">
      <div className="w-full max-w-[420px] rounded-card border border-edge bg-paper p-8 shadow-[0_1px_1px_rgba(28,39,76,0.04)]">
        <span className="mb-6 inline-flex rounded-2xl bg-navy px-4 py-3">
          <Image src="/brand/freitty-logo.svg" alt={tc("appName")} width={100} height={30} priority />
        </span>
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-ink">{t("title")}</h1>
        <p className="mt-2 mb-6 text-sm text-ink-mute">{actor.mustChangePassword ? t("mustChange") : t("subtitle")}</p>
        <ChangePasswordForm minLength={MIN_PASSWORD_LENGTH} />
      </div>
    </main>
  );
}
