"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Badge, Button, buttonClass, Field } from "./ui";

type Kind = "org" | "employees" | "rates" | "balances" | "accesses" | "assets";
type Result = {
  committed: boolean;
  rows: { line: number; key: string; action: "create" | "update" | "unchanged" | "error"; errors: string[] }[];
  summary: Record<"create" | "update" | "unchanged" | "error", number>;
};

const tone = { create: "ok", update: "warn", unchanged: "neutral", error: "red" } as const;

export function ImportWizard({ templates }: { templates: Record<Kind, string[]> }) {
  const t = useTranslations("import");
  const [kind, setKind] = useState<Kind>("org");
  const [csv, setCsv] = useState<string>("");
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();

  const send = (commit: boolean) =>
    start(async () => {
      setError(null);
      try {
        setResult(await api<Result>(`/import/${kind}`, { body: { csv, commit } }));
      } catch (err) {
        setResult(null);
        setError(err);
      }
    });

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templates[kind].join(",") + "\n")}`;
  const hasErrors = !!result && result.summary.error > 0;
  const nothingToDo = !!result && result.summary.create + result.summary.update === 0;

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-soft">{t("order")}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("kind")}>
          <select
            className="field"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value as Kind);
              setResult(null);
            }}
          >
            {(["org", "employees", "rates", "balances", "accesses", "assets"] as const).map((k) => (
              <option key={k} value={k}>
                {t(`kinds.${k}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("file")}>
          <input
            type="file"
            accept=".csv,text/csv"
            className="field"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              setResult(null);
              setFileName(f?.name ?? "");
              setCsv(f ? await f.text() : "");
            }}
          />
        </Field>
      </div>
      <div className="rounded-lg bg-cream/70 p-3 text-xs">
        <span className="label">{t("columns")}</span>
        <code className="break-all">{templates[kind].join(", ")}</code>
        <a className={buttonClass("secondary", "mt-2 py-1 text-xs")} href={templateHref} download={`${kind}-template.csv`}>
          {t("downloadTemplate")}
        </a>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" disabled={!csv || pending} onClick={() => send(false)}>
          {t("preview")}
        </Button>
        <Button disabled={!result || hasErrors || nothingToDo || result.committed || pending} onClick={() => send(true)}>
          {t("commit")}
        </Button>
        {fileName && <span className="self-center text-xs text-ink-mute">{fileName}</span>}
      </div>

      <ErrorBox error={error} />

      {result && (
        <div className="space-y-3">
          {result.committed && <p className="rounded-md bg-ok-tint px-3 py-2 text-sm text-ok">{t("committed")}</p>}
          {hasErrors && <p className="rounded-md bg-red-tint px-3 py-2 text-sm text-red-strong">{t("hasErrors")}</p>}
          <p className="text-sm font-medium">{t("summary", result.summary)}</p>
          <div className="max-h-[480px] overflow-auto rounded-xl border border-line bg-paper">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("line")}</th>
                  <th>{t("key")}</th>
                  <th>{t("result")}</th>
                  <th>{t("errors")}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.line} className={r.action === "error" ? "bg-red-tint/40" : ""}>
                    <td className="font-mono text-xs">{r.line}</td>
                    <td className="font-mono text-xs">{r.key}</td>
                    <td>
                      <Badge tone={tone[r.action]}>{t(`actions.${r.action}`)}</Badge>
                    </td>
                    <td className="text-xs text-red-strong">{r.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
