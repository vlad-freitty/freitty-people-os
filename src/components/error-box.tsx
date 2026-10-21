"use client";

import { useTranslations } from "next-intl";
import { ApiRequestError, errorDetails } from "./api";

const KNOWN = ["forbidden", "not_found", "validation_failed", "conflict", "unauthorized", "internal_error"] as const;

export function ErrorBox({ error }: { error: unknown }) {
  const t = useTranslations("errors");
  if (!error) return null;
  const code = error instanceof ApiRequestError ? error.error.code : "internal_error";
  const key = (KNOWN as readonly string[]).includes(code) ? (code as (typeof KNOWN)[number]) : "internal_error";
  const details = errorDetails(error);
  return (
    <div role="alert" className="rounded-xl border border-red/30 bg-red-tint px-3 py-2 text-sm text-red-strong">
      <p className="font-medium">{t(key)}</p>
      {details.length > 0 && (
        <ul className="mt-1 list-disc pl-5 font-mono text-xs">
          {details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
