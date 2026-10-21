"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "../api";
import { ErrorBox } from "../error-box";
import { Badge, Button, Field } from "../ui";

type PaymentDto = {
  id: string;
  employee: { id: string; name: string; employmentType: string; department: string };
  currency: string;
  total: string;
  status: "calculated" | "documents_received" | "approved" | "paid";
  paymentRef: string | null;
  documentOk: boolean;
  lines: { id: string; kind: "shifts" | "monthly_rate" | "bonus" | "adjustment"; amount: string; description: string }[];
};

const TONE = { calculated: "warn", documents_received: "warn", approved: "ok", paid: "ink" } as const;

function useRun() {
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>, after?: () => void) =>
    start(async () => {
      setError(null);
      try {
        await fn();
        after?.();
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  return { error, pending, run };
}

export function NewPeriodForm({ companies }: { companies: { id: string; name: string }[] }) {
  const t = useTranslations("payments");
  const { error, pending, run } = useRun();
  const month = new Date().toISOString().slice(0, 7);
  const [v, setV] = useState({ companyId: companies[0]?.id ?? "", periodStart: `${month}-01`, periodEnd: new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).toISOString().slice(0, 10) });
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api("/payments/periods", { body: v }));
      }}
    >
      <Field label={t("company")}>
        <select className="field" value={v.companyId} onChange={(e) => setV({ ...v, companyId: e.target.value })}>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("start")}>
        <input className="field" type="date" value={v.periodStart} onChange={(e) => setV({ ...v, periodStart: e.target.value })} />
      </Field>
      <Field label={t("end")}>
        <input className="field" type="date" value={v.periodEnd} onChange={(e) => setV({ ...v, periodEnd: e.target.value })} />
      </Field>
      <Button disabled={pending}>{t("newPeriod")}</Button>
      <div className="w-full">
        <ErrorBox error={error} />
      </div>
    </form>
  );
}

export function PeriodActions({ periodId, status }: { periodId: string; status: "open" | "calculated" | "locked" }) {
  const t = useTranslations("payments");
  const { error, pending, run } = useRun();
  const [warnings, setWarnings] = useState<{ employeeId: string; code: string; date: string }[] | null>(null);
  const [count, setCount] = useState<number | null>(null);
  if (status === "locked") return null;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            run(async () => {
              const res = await api<{ payments: number; warnings: { employeeId: string; code: string; date: string }[] }>(`/payments/periods/${periodId}/calculate`, { method: "POST" });
              setWarnings(res.warnings);
              setCount(res.payments);
            })
          }
        >
          {status === "open" ? t("calculate") : t("recalculate")}
        </Button>
        {status === "calculated" && (
          <Button variant="secondary" disabled={pending} onClick={() => confirm(t("lockConfirm")) && run(() => api(`/payments/periods/${periodId}/lock`, { method: "POST" }))}>
            {t("lock")}
          </Button>
        )}
      </div>
      <ErrorBox error={error} />
      {count !== null && <p className="text-sm text-ok">{t("calculated", { n: count })}</p>}
      {warnings && warnings.length > 0 && (
        <div className="rounded-xl bg-warn-tint px-3 py-2 text-xs text-warn">
          <p className="font-medium">{t("warnings")}</p>
          <ul>
            {warnings.map((w, i) => (
              <li key={i}>
                {w.date} · {t(`warningCodes.${w.code}` as "warningCodes.no_rate_for_shift")}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function PaymentsTable({ payments, canManage, periodLocked }: { payments: PaymentDto[]; canManage: boolean; periodLocked: boolean }) {
  const t = useTranslations("payments");
  if (payments.length === 0) return <p className="text-sm text-ink-mute">{t("empty")}</p>;
  return (
    <div className="overflow-x-auto rounded-card border border-edge bg-paper">
      <table className="table">
        <thead>
          <tr>
            <th>{t("employee")}</th>
            <th>{t("lines")}</th>
            <th>{t("total")}</th>
            <th>{t("document")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <PaymentRow key={p.id} p={p} canManage={canManage} periodLocked={periodLocked} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentRow({ p, canManage, periodLocked }: { p: PaymentDto; canManage: boolean; periodLocked: boolean }) {
  const t = useTranslations("payments");
  const te = useTranslations("employmentType");
  const { error, pending, run } = useRun();
  const [ref, setRef] = useState("");
  const [adj, setAdj] = useState({ amount: "", comment: "" });
  const status = (body: unknown) => run(() => api(`/payments/${p.id}/status`, { method: "PUT", body }));
  const editable = p.status === "calculated" || p.status === "documents_received";
  return (
    <tr>
      <td>
        <span className="font-medium">{p.employee.name}</span>
        <span className="block text-xs text-ink-mute">
          {te(p.employee.employmentType as "employee")} · {p.employee.department}
        </span>
      </td>
      <td className="text-xs">
        <ul className="space-y-0.5">
          {p.lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-3">
              <span>
                <span className="font-medium">{t(`kinds.${l.kind}`)}</span> · {l.description}
              </span>
              <span className={`font-mono ${Number(l.amount) < 0 ? "text-red-strong" : ""}`}>{l.amount}</span>
            </li>
          ))}
        </ul>
        {canManage && editable && !periodLocked && (
          <form
            className="mt-2 flex flex-wrap gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api(`/payments/${p.id}/adjustments`, { body: { amount: Number(adj.amount), comment: adj.comment } }), () => setAdj({ amount: "", comment: "" }));
            }}
          >
            <input className="field w-24 py-1 text-xs" type="number" step="0.01" required placeholder={t("amount")} value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
            <input className="field w-48 py-1 text-xs" required placeholder={t("comment")} value={adj.comment} onChange={(e) => setAdj({ ...adj, comment: e.target.value })} />
            <Button variant="ghost" className="py-1 text-xs" disabled={pending}>
              {t("adjust")}
            </Button>
          </form>
        )}
      </td>
      <td className="whitespace-nowrap font-mono">
        {p.total} {p.currency}
      </td>
      <td>
        {p.employee.employmentType === "contractor" ? (
          <Badge tone={p.documentOk ? "ok" : "red"}>{p.documentOk ? t("documentOk") : t("documentMissing")}</Badge>
        ) : (
          <span className="text-xs text-ink-mute">{t("notNeeded")}</span>
        )}
      </td>
      <td className="space-y-1">
        <Badge tone={TONE[p.status]}>{t(`status.${p.status}`)}</Badge>
        {p.paymentRef && <span className="block font-mono text-xs text-ink-mute">{p.paymentRef}</span>}
        {canManage && (
          <div className="flex flex-col gap-1">
            {p.status === "calculated" && (
              <Button variant="ghost" className="py-1 text-xs" disabled={pending} onClick={() => status({ status: "documents_received" })}>
                {t("markDocs")}
              </Button>
            )}
            {editable && (
              <Button variant="secondary" className="py-1 text-xs" disabled={pending} onClick={() => status({ status: "approved" })}>
                {t("approve")}
              </Button>
            )}
            {p.status === "approved" && (
              <form
                className="flex gap-1"
                onSubmit={(e) => {
                  e.preventDefault();
                  status({ status: "paid", paymentRef: ref });
                }}
              >
                <input className="field w-28 py-1 text-xs" required placeholder={t("paymentRef")} value={ref} onChange={(e) => setRef(e.target.value)} />
                <Button className="py-1 text-xs" disabled={pending}>
                  {t("pay")}
                </Button>
              </form>
            )}
          </div>
        )}
        <ErrorBox error={error} />
      </td>
    </tr>
  );
}

export function CoefficientForm({ company }: { company: { id: string; name: string; coefficient: number } }) {
  const t = useTranslations("payments");
  const { error, pending, run } = useRun();
  const [value, setValue] = useState(String(company.coefficient));
  return (
    <form
      className="flex flex-wrap items-center gap-2 border-b border-line/60 py-1.5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => api("/payments/coefficients", { method: "PUT", body: { companyId: company.id, coefficient: Number(value) } }));
      }}
    >
      <span className="w-32 font-medium">{company.name}</span>
      <input className="field w-24 py-1" type="number" step="0.05" min="0.5" max="5" value={value} onChange={(e) => setValue(e.target.value)} aria-label={company.name} />
      <Button variant="ghost" className="py-1 text-xs" disabled={pending}>
        {t("save")}
      </Button>
      <ErrorBox error={error} />
    </form>
  );
}
