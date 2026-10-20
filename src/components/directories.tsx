"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ApiRequestError } from "./api";
import { ErrorBox } from "./error-box";
import { Button, Field } from "./ui";

type Person = { id: string; label: string };

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

export function SystemForm({ people, initial }: { people: Person[]; initial?: { id: string; name: string; ownerId: string | null; isActive: boolean } }) {
  const t = useTranslations();
  const { error, pending, run } = useRun();
  const [name, setName] = useState(initial?.name ?? "");
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? "");
  const [isActive, setActive] = useState(initial?.isActive ?? true);
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name, ownerEmployeeId: ownerId || null, isActive };
        run(() => (initial ? api(`/systems/${initial.id}`, { method: "PATCH", body }) : api("/systems", { body })), () => !initial && (setName(""), setOwnerId("")));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
        <input className="field" required value={name} placeholder={t("systems.name")} onChange={(e) => setName(e.target.value)} />
        <select className="field" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label={t("systems.owner")}>
          <option value="">{t("systems.owner")}: {t("common.none")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
          {t("systems.active")}
        </label>
        <Button disabled={pending} variant={initial ? "secondary" : "primary"}>
          {initial ? t("common.save") : t("systems.newSystem")}
        </Button>
      </div>
    </form>
  );
}

export function BundleForm({
  systems,
  initial,
}: {
  systems: { id: string; name: string }[];
  initial?: { id: string; name: string; positionOrRole: string; items: { systemId: string; accessLevel: string }[] };
}) {
  const t = useTranslations();
  const { error, pending, run } = useRun();
  const [name, setName] = useState(initial?.name ?? "");
  const [position, setPosition] = useState(initial?.positionOrRole ?? "");
  const [items, setItems] = useState(initial?.items ?? [{ systemId: "", accessLevel: "" }]);
  const setItem = (i: number, patch: Partial<(typeof items)[number]>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name, positionOrRole: position, items: items.filter((i) => i.systemId) };
        run(() => (initial ? api(`/bundles/${initial.id}`, { method: "PATCH", body }) : api("/bundles", { body })), () => !initial && (setName(""), setPosition(""), setItems([{ systemId: "", accessLevel: "" }])));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label={t("systems.name")}>
          <input className="field" required value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("systems.position")}>
          <input className="field" required value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
      </div>
      {items.map((item, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
          <select className="field" value={item.systemId} onChange={(e) => setItem(i, { systemId: e.target.value })} aria-label={t("step.system")}>
            <option value="" />
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input className="field" value={item.accessLevel} placeholder={t("systems.level")} onChange={(e) => setItem(i, { accessLevel: e.target.value })} />
          <Button type="button" variant="ghost" onClick={() => setItems((list) => list.filter((_, j) => j !== i))}>
            ✕
          </Button>
        </div>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => setItems((list) => [...list, { systemId: "", accessLevel: "" }])}>
          + {t("systems.addItem")}
        </Button>
        <Button disabled={pending} variant={initial ? "secondary" : "primary"}>
          {initial ? t("common.save") : t("systems.newBundle")}
        </Button>
      </div>
    </form>
  );
}

export function AssetForm() {
  const t = useTranslations("assets");
  const { error, pending, run } = useRun();
  const empty = { type: "laptop", name: "", serialOrSeat: "", monthlyCost: "", currency: "USD" };
  const [v, setV] = useState(empty);
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })), className: "field" });
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, serialOrSeat: v.serialOrSeat || null, monthlyCost: v.monthlyCost === "" ? null : Number(v.monthlyCost), currency: v.monthlyCost === "" ? null : v.currency };
        run(() => api("/assets", { body }), () => setV(empty));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-2 sm:grid-cols-5">
        <select {...bind("type")} aria-label={t("kind")}>
          {(["laptop", "phone", "license", "other"] as const).map((x) => (
            <option key={x} value={x}>
              {t(`type.${x}`)}
            </option>
          ))}
        </select>
        <input required placeholder={t("name")} {...bind("name")} />
        <input placeholder={t("serial")} {...bind("serialOrSeat")} />
        <input type="number" min={0} step="0.01" placeholder={t("cost")} {...bind("monthlyCost")} />
        <input maxLength={3} placeholder={t("currency")} {...bind("currency")} />
      </div>
      <Button disabled={pending}>{t("newAsset")}</Button>
    </form>
  );
}

export function AssetAssign({ assetId, assigned, people }: { assetId: string; assigned: boolean; people: Person[] }) {
  const t = useTranslations("assets");
  const { error, pending, run } = useRun();
  const [employeeId, setEmployeeId] = useState("");
  if (assigned) {
    return (
      <>
        <Button variant="ghost" className="py-1 text-xs" disabled={pending} onClick={() => run(() => api(`/assets/${assetId}/assignee`, { method: "PUT", body: { employeeId: null } }))}>
          {t("return")}
        </Button>
        <ErrorBox error={error} />
      </>
    );
  }
  return (
    <div className="flex gap-1">
      <select className="field py-1 text-xs" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label={t("assignedTo")}>
        <option value="" />
        {people.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <Button variant="secondary" className="py-1 text-xs" disabled={pending || !employeeId} onClick={() => run(() => api(`/assets/${assetId}/assignee`, { method: "PUT", body: { employeeId } }))}>
        {t("assign")}
      </Button>
      <ErrorBox error={error} />
    </div>
  );
}

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const t = useTranslations("profile");
  const { error, pending, run } = useRun();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("contract");
  const [validTo, setValidTo] = useState("");
  return (
    <form
      className="space-y-2 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        run(async () => {
          const body = new FormData();
          body.append("file", file);
          body.append("type", type);
          body.append("validTo", validTo);
          const res = await fetch(`/api/v1/employees/${employeeId}/documents`, { method: "POST", body });
          if (!res.ok) throw new ApiRequestError((await res.json().catch(() => ({}))).error ?? { code: "internal_error" }, res.status);
        });
      }}
    >
      <ErrorBox error={error} />
      <div className="grid grid-cols-2 gap-2">
        <select className="field" value={type} onChange={(e) => setType(e.target.value)} aria-label={t("uploadDocument")}>
          {(["contract", "nda", "act", "invoice", "w9", "other"] as const).map((d) => (
            <option key={d} value={d}>
              {t(`docType.${d}`)}
            </option>
          ))}
        </select>
        <input type="date" className="field" value={validTo} onChange={(e) => setValidTo(e.target.value)} aria-label={t("validTo")} />
      </div>
      <input type="file" className="field" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <Button variant="secondary" disabled={pending || !file}>
        {t("uploadDocument")}
      </Button>
    </form>
  );
}
