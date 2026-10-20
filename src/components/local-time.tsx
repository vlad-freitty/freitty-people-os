"use client";

import { useLocale } from "next-intl";
import { useEffect, useState } from "react";

/** Timestamps are stored in UTC and shown in the browser's time zone (PRD 7). Rendered after mount to avoid a server/client mismatch. */
export function LocalTime({ iso }: { iso: string }) {
  const locale = useLocale();
  const [text, setText] = useState<string>("");
  useEffect(() => {
    setText(new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)));
  }, [iso, locale]);
  return <time dateTime={iso}>{text}</time>;
}
