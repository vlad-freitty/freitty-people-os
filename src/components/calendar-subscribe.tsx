"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button } from "./ui";

/** Personal ICS subscription link (PRD 5). */
export function CalendarSubscribe() {
  const t = useTranslations("calendar");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const load = (rotate: boolean) =>
    start(async () => {
      setError(null);
      try {
        const res = await api<{ path: string }>("/calendar/feed", { body: { rotate } });
        setUrl(`${window.location.origin}${res.path}`);
      } catch (err) {
        setError(err);
      }
    });
  return (
    <div className="space-y-2 text-sm">
      <p className="text-ink-soft">{t("subscribeHint")}</p>
      <ErrorBox error={error} />
      {url ? (
        <>
          <input readOnly className="field font-mono text-xs" value={url} onFocus={(e) => e.target.select()} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(url)}>
              {t("copy")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => load(true)}>
              {t("rotate")}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" disabled={pending} onClick={() => load(false)}>
          {t("getLink")}
        </Button>
      )}
    </div>
  );
}
