"use client";

import {
  Alert02Icon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  CloudUploadIcon,
  Coins01Icon,
  Download01Icon,
  FileValidationIcon,
  HierarchySquare01Icon,
  Key01Icon,
  LaptopIcon,
  UserGroupIcon,
  ViewIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useState, useTransition, type ReactNode } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Badge, Button, buttonClass, Stat } from "./ui";

type Kind = "org" | "employees" | "rates" | "balances" | "accesses" | "assets";
type Result = {
  committed: boolean;
  rows: { line: number; key: string; action: "create" | "update" | "unchanged" | "error"; errors: string[] }[];
  summary: Record<"create" | "update" | "unchanged" | "error", number>;
};

const tone = { create: "ok", update: "warn", unchanged: "neutral", error: "red" } as const;
const KINDS: { kind: Kind; icon: IconSvgElement }[] = [
  { kind: "org", icon: HierarchySquare01Icon },
  { kind: "employees", icon: UserGroupIcon },
  { kind: "rates", icon: Coins01Icon },
  { kind: "balances", icon: Calendar03Icon },
  { kind: "accesses", icon: Key01Icon },
  { kind: "assets", icon: LaptopIcon },
];

/** One numbered step of the wizard: number circle, title, body. Done steps turn green. */
function Step({ n, title, done, children }: { n: number; title: ReactNode; done?: boolean; children: ReactNode }) {
  return (
    <section className="rounded-card border border-edge bg-paper p-4 shadow-[0_1px_1px_rgba(28,39,76,0.04)] sm:p-5">
      <h2 className="mb-4 flex items-center gap-2.5 text-sm font-bold text-ink-2">
        <span className={`flex size-7 items-center justify-center rounded-full text-xs text-white ${done ? "bg-ok" : "bg-navy"}`}>
          {done ? <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} /> : n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function ImportWizard({ templates }: { templates: Record<Kind, string[]> }) {
  const t = useTranslations("import");
  const t2 = useTranslations("admin2");
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
    <div className="space-y-4">
      <Step n={1} title={t("kind")} done>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
          {KINDS.map(({ kind: k, icon }, i) => {
            const on = k === kind;
            return (
              <button
                key={k}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  setKind(k);
                  setResult(null);
                }}
                className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left text-sm transition ${on ? "border-navy bg-navy text-white" : "border-line bg-paper text-ink-2 hover:bg-cream"}`}
              >
                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${on ? "bg-white/15" : "bg-cream"}`}>
                  <HugeiconsIcon icon={icon} size={18} />
                </span>
                <span className="min-w-0">
                  <span className={`block text-[10px] font-medium uppercase ${on ? "text-white/60" : "text-ink-mute"}`}>{t2("orderStep", { n: i + 1 })}</span>
                  <span className="block leading-tight font-medium">{t(`kinds.${k}`)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Step>

      <Step n={2} title={t("file")} done={!!csv}>
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-cream/50 px-4 py-6 text-center transition hover:border-ink hover:bg-cream">
            <HugeiconsIcon icon={CloudUploadIcon} size={28} className="text-ink-soft" />
            <span className="text-sm font-bold text-ink-2">{fileName || t2("chooseFile")}</span>
            <span className="text-xs text-ink-mute">{fileName ? t2("replaceFile") : t2("csvOnly")}</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                setResult(null);
                setFileName(f?.name ?? "");
                setCsv(f ? await f.text() : "");
              }}
            />
          </label>
          <div className="rounded-2xl bg-cream p-4 text-xs">
            <span className="label">{t("columns")}</span>
            <div className="mb-3 flex flex-wrap gap-1">
              {templates[kind].map((c) => (
                <code key={c} className="rounded-md border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-2">
                  {c}
                </code>
              ))}
            </div>
            <a className={buttonClass("secondary")} href={templateHref} download={`${kind}-template.csv`}>
              <HugeiconsIcon icon={Download01Icon} size={16} />
              {t("downloadTemplate")}
            </a>
          </div>
        </div>
      </Step>

      <Step n={3} title={t2("checkAndImport")} done={!!result?.committed}>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={!csv || pending} onClick={() => send(false)}>
            <HugeiconsIcon icon={ViewIcon} size={17} />
            {t("preview")}
          </Button>
          <Button disabled={!result || hasErrors || nothingToDo || result.committed || pending} onClick={() => send(true)}>
            <HugeiconsIcon icon={FileValidationIcon} size={17} />
            {t("commit")}
          </Button>
        </div>
        {!result && !error && <p className="mt-3 text-xs text-ink-mute">{t2("previewHint")}</p>}

        <div className="mt-4 space-y-4">
          <ErrorBox error={error} />
          {result && (
            <>
              {result.committed ? (
                <Banner tone="ok" icon={CheckmarkCircle02Icon}>
                  {t("committed")}
                </Banner>
              ) : hasErrors ? (
                <Banner tone="red" icon={Alert02Icon}>
                  {t("hasErrors")}
                </Banner>
              ) : nothingToDo ? (
                <Banner tone="neutral" icon={CheckmarkCircle02Icon}>
                  {t2("nothingToImport")}
                </Banner>
              ) : (
                <Banner tone="warn" icon={ViewIcon}>
                  {t2("readyToCommit")}
                </Banner>
              )}
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label={t("actions.create")} value={result.summary.create} tone="ok" />
                <Stat label={t("actions.update")} value={result.summary.update} tone="warn" />
                <Stat label={t("actions.unchanged")} value={result.summary.unchanged} />
                <Stat label={t("actions.error")} value={result.summary.error} tone="red" />
              </div>
              <div className="max-h-[480px] overflow-auto rounded-2xl border border-line">
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
            </>
          )}
        </div>
      </Step>
    </div>
  );
}

const bannerTones = { ok: "bg-ok-tint text-ok-strong", red: "bg-red-tint text-red-strong", warn: "bg-warn-tint text-warn", neutral: "bg-cream text-ink-soft" };

function Banner({ tone: bt, icon, children }: { tone: keyof typeof bannerTones; icon: IconSvgElement; children: ReactNode }) {
  return (
    <p className={`flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium ${bannerTones[bt]}`}>
      <HugeiconsIcon icon={icon} size={20} className="shrink-0" />
      {children}
    </p>
  );
}
