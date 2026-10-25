"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
    <div role="alert" className="flex items-start gap-2.5 rounded-2xl border border-red/30 bg-red-tint px-4 py-3 text-sm text-red-strong">
      <HugeiconsIcon icon={Alert02Icon} size={20} className="mt-px shrink-0" />
      <div className="min-w-0">
        <p className="font-medium">{t(key)}</p>
        {details.length > 0 && (
          <ul className="mt-1 list-disc pl-5 font-mono text-xs break-words">
            {details.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
