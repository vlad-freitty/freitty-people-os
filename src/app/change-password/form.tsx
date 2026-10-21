"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { changePasswordAction, type ChangeState } from "./actions";

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations("password");
  const [state, action, pending] = useActionState<ChangeState, FormData>(changePasswordAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div role="alert" className="rounded-xl border border-red/30 bg-red-tint px-3 py-2 text-sm text-red-strong">
          {t(`errors.${state.error}` as "errors.invalid", { n: minLength })}
        </div>
      )}
      <label className="block">
        <span className="label">{t("current")}</span>
        <input className="field h-10" name="current" type="password" autoComplete="current-password" />
      </label>
      <label className="block">
        <span className="label">{t("next")}</span>
        <input className="field h-10" name="next" type="password" autoComplete="new-password" minLength={minLength} required />
      </label>
      <label className="block">
        <span className="label">{t("confirm")}</span>
        <input className="field h-10" name="confirm" type="password" autoComplete="new-password" minLength={minLength} required />
      </label>
      <p className="text-xs text-ink-mute">{t("rules", { n: minLength })}</p>
      <Button type="submit" disabled={pending} className="h-12 w-full">
        {t("save")}
      </Button>
    </form>
  );
}
