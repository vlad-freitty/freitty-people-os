"use client";

import { Alert02Icon, InformationCircleIcon, LockPasswordIcon, SquareLock02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { changePasswordAction, type ChangeState } from "./actions";

function PasswordField({ label, icon, ...input }: { label: string; icon: IconSvgElement } & React.ComponentProps<"input">) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="relative block">
        <HugeiconsIcon icon={icon} size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-mute" />
        <input className="field h-12 pl-11!" type="password" {...input} />
      </span>
    </label>
  );
}

export function ChangePasswordForm({ minLength }: { minLength: number }) {
  const t = useTranslations("password");
  const [state, action, pending] = useActionState<ChangeState, FormData>(changePasswordAction, { error: null });
  return (
    <form action={action} className="space-y-4">
      {state.error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red/30 bg-red-tint px-4 py-3 text-sm text-red-strong">
          <HugeiconsIcon icon={Alert02Icon} size={20} className="mt-px shrink-0" />
          {t(`errors.${state.error}` as "errors.invalid", { n: minLength })}
        </div>
      )}
      <PasswordField label={t("current")} icon={LockPasswordIcon} name="current" autoComplete="current-password" />
      <PasswordField label={t("next")} icon={SquareLock02Icon} name="next" autoComplete="new-password" minLength={minLength} required />
      <PasswordField label={t("confirm")} icon={SquareLock02Icon} name="confirm" autoComplete="new-password" minLength={minLength} required />
      <p className="flex items-start gap-2 rounded-2xl bg-cream px-4 py-3 text-xs text-ink-soft">
        <HugeiconsIcon icon={InformationCircleIcon} size={16} className="mt-px shrink-0 text-ink-mute" />
        {t("rules", { n: minLength })}
      </p>
      <Button type="submit" disabled={pending} className="h-12 w-full">
        {t("save")}
      </Button>
    </form>
  );
}
