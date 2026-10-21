"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Badge, Button } from "./ui";

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
      <div className="space-y-2 rounded-xl bg-cream/60 p-3 text-sm">
        <p className="label">{t("telegram")}</p>
        {!initial.telegram.configured ? (
          <p className="text-ink-soft">{t("notConfigured")}</p>
        ) : initial.telegram.linked ? (
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="ok">{t("linked")}</Badge>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => api("/notifications/telegram", { method: "DELETE" }))}>
              {t("disconnect")}
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <Badge>{t("notLinked")}</Badge>
            <div>
              <Button variant="secondary" disabled={pending} onClick={() => run(async () => setLink(await api("/notifications/telegram", { method: "POST" })))}>
                {t("connect")}
              </Button>
            </div>
            {link && (
              <div className="space-y-1">
                <p className="text-ink-soft">{t("codeHint", { code: link.code, minutes: link.expiresInMinutes })}</p>
                <p className="font-mono text-lg tracking-widest">{link.code}</p>
                {link.deepLink && (
                  <a className="underline" href={link.deepLink} target="_blank" rel="noreferrer">
                    {t("openBot")}
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>{t("type")}</th>
            {CHANNELS.map((c) => (
              <th key={c}>{t(`channels.${c}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TYPES.map((type) => (
            <tr key={type}>
              <td>{t(`types.${type}`)}</td>
              {CHANNELS.map((c) => (
                <td key={c}>
                  <input
                    type="checkbox"
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
      <div className="flex items-center gap-3">
        <Button disabled={pending} onClick={() => run(async () => (await api("/notifications/settings", { method: "PUT", body: prefs }), setSaved(true)))}>
          {t("save")}
        </Button>
        {saved && <span className="text-sm text-ok">✓</span>}
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
