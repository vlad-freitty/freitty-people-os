"use client";

import { Copy01Icon, InformationCircleIcon, Link01Icon, RefreshIcon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button } from "./ui";

/** Personal ICS subscription link (PRD 5). */
export function CalendarSubscribe() {
  const t = useTranslations("calendar");
  const tc = useTranslations("people2");
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const load = (rotate: boolean) =>
    start(async () => {
      setError(null);
      setCopied(false);
      try {
        const res = await api<{ path: string }>("/calendar/feed", { body: { rotate } });
        setUrl(`${window.location.origin}${res.path}`);
      } catch (err) {
        setError(err);
      }
    });
  return (
    <div className="space-y-3 text-sm">
      <p className="flex items-start gap-2 rounded-xl bg-cream px-3.5 py-3 text-xs text-ink-soft">
        <HugeiconsIcon icon={InformationCircleIcon} size={16} className="mt-px shrink-0" />
        {t("subscribeHint")}
      </p>
      <ErrorBox error={error} />
      {url ? (
        <>
          <input readOnly className="field font-mono text-xs!" value={url} onFocus={(e) => e.target.select()} aria-label={t("subscribe")} />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(url);
                setCopied(true);
              }}
            >
              <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
              {copied ? tc("copied") : t("copy")}
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => load(true)}>
              <HugeiconsIcon icon={RefreshIcon} size={16} />
              {t("rotate")}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="secondary" disabled={pending} onClick={() => load(false)}>
          <HugeiconsIcon icon={Link01Icon} size={16} />
          {t("getLink")}
        </Button>
      )}
    </div>
  );
}
