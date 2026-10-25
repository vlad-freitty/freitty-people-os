"use client";

import { ArrowRight01Icon, TelegramIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Badge, Button, IconTile } from "./ui";

type Channel = "in_app" | "telegram";
type Type = "step_assigned" | "step_overdue" | "request_done" | "request_rejected";
type Settings = {
  telegram: { configured: boolean; linked: boolean; bot: string | null };
  prefs: Record<Type, Record<Channel, boolean>>;
};

const TYPES: Type[] = ["step_assigned", "step_overdue", "request_done", "request_rejected"];
const CHANNELS: Channel[] = ["in_app", "telegram"];

/** Own notification channels and the Telegram link (PRD 8, phase 5). */
export function NotificationSettings({ initial }: { initial: Settings }) {
  const t = useTranslations("notifications");
  const tc = useTranslations("common");
  const router = useRouter();
  const [prefs, setPrefs] = useState(initial.prefs);
  const [link, setLink] = useState<{ code: string; deepLink: string | null; expiresInMinutes: number } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      setError(null);
      setSaved(false);
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });

  return (
    <div className="space-y-4">
      <ErrorBox error={error} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-3 rounded-2xl border border-line p-4 text-sm">
          <div className="flex items-center gap-3">
            <IconTile icon={TelegramIcon} tone="blue" size={36} />
            <div className="min-w-0">
              <p className="font-bold text-ink-2">{t("telegram")}</p>
              {initial.telegram.configured &&
                (initial.telegram.linked ? <Badge tone="ok">{t("linked")}</Badge> : <Badge>{t("notLinked")}</Badge>)}
            </div>
          </div>
          {!initial.telegram.configured ? (
            <p className="text-xs text-ink-soft">{t("notConfigured")}</p>
          ) : initial.telegram.linked ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => api("/notifications/telegram", { method: "DELETE" }))}>
              {t("disconnect")}
            </Button>
          ) : (
            <div className="space-y-3">
              <Button variant="secondary" disabled={pending} onClick={() => run(async () => setLink(await api("/notifications/telegram", { method: "POST" })))}>
                <HugeiconsIcon icon={TelegramIcon} size={16} />
                {t("connect")}
              </Button>
              {link && (
                <div className="space-y-2 rounded-xl bg-cream p-3">
                  <p className="text-xs text-ink-soft">{t("codeHint", { code: link.code, minutes: link.expiresInMinutes })}</p>
                  <p className="font-mono text-lg font-bold tracking-widest text-ink-2 select-all">{link.code}</p>
                  {link.deepLink && (
                    <a className="inline-flex items-center gap-1 font-medium text-red hover:text-red-strong" href={link.deepLink} target="_blank" rel="noreferrer">
                      {t("openBot")}
                      <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("type")}</th>
                  {CHANNELS.map((c) => (
                    <th key={c} className="text-center">
                      {t(`channels.${c}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TYPES.map((type) => (
                  <tr key={type}>
                    <td className="font-medium text-ink-2">{t(`types.${type}`)}</td>
                    {CHANNELS.map((c) => (
                      <td key={c} className="text-center">
                        <input
                          type="checkbox"
                          className="size-4 accent-red disabled:opacity-40"
                          aria-label={`${t(`types.${type}`)} · ${t(`channels.${c}`)}`}
                          checked={prefs[type][c]}
                          disabled={c === "telegram" && !initial.telegram.linked}
                          onChange={(e) => setPrefs((p) => ({ ...p, [type]: { ...p[type], [c]: e.target.checked } }))}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3">
            <Button disabled={pending} onClick={() => run(async () => (await api("/notifications/settings", { method: "PUT", body: prefs }), setSaved(true)))}>
              {t("save")}
            </Button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-ok-strong">
                <HugeiconsIcon icon={Tick02Icon} size={16} />
                {tc("saved")}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function MarkAllRead() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() =>
        start(async () => {
          await api("/notifications/read", { body: {} });
          router.refresh();
        })
      }
    >
      {t("markAll")}
    </Button>
  );
}
