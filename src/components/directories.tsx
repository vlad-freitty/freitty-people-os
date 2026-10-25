"use client";

import { Add01Icon, ArrowTurnBackwardIcon, Cancel01Icon, Upload04Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api, ApiRequestError } from "./api";
import { ErrorBox } from "./error-box";
import { useModalClose } from "./overlay";
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

/** Save / cancel row at the bottom of a dialog form. */
function DialogActions({ pending, label }: { pending: boolean; label: string }) {
  const t = useTranslations("common");
  const close = useModalClose();
  return (
    <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
      {close && (
        <Button type="button" variant="secondary" onClick={close}>
          {t("cancel")}
        </Button>
      )}
      <Button disabled={pending}>{label}</Button>
    </div>
  );
}

export function SystemForm({ people, initial }: { people: Person[]; initial?: { id: string; name: string; ownerId: string | null; isActive: boolean } }) {
  const t = useTranslations();
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [name, setName] = useState(initial?.name ?? "");
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? "");
  const [isActive, setActive] = useState(initial?.isActive ?? true);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name, ownerEmployeeId: ownerId || null, isActive };
        run(() => (initial ? api(`/systems/${initial.id}`, { method: "PATCH", body }) : api("/systems", { body })), () => close?.());
      }}
    >
      <ErrorBox error={error} />
      <Field label={t("systems.name")}>
        <input className="field" required autoFocus placeholder="Google Workspace" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t("systems.owner")}>
        <select className="field" value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
          <option value="">{t("common.none")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-ink-mute">{t("systems.ownerHint")}</span>
      </Field>
      <label className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3 text-sm">
        <input type="checkbox" className="size-4 accent-red" checked={isActive} onChange={(e) => setActive(e.target.checked)} />
        <span>
          <span className="block font-bold text-ink-2">{t("systems.active")}</span>
          <span className="block text-xs text-ink-mute">{t("systems.activeHint")}</span>
        </span>
      </label>
      <DialogActions pending={pending} label={initial ? t("common.save") : t("systems.newSystem")} />
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
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [name, setName] = useState(initial?.name ?? "");
  const [position, setPosition] = useState(initial?.positionOrRole ?? "");
  const [items, setItems] = useState(initial?.items.map(({ systemId, accessLevel }) => ({ systemId, accessLevel })) ?? [{ systemId: "", accessLevel: "" }]);
  const setItem = (i: number, patch: Partial<(typeof items)[number]>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { name, positionOrRole: position, items: items.filter((i) => i.systemId) };
        run(() => (initial ? api(`/bundles/${initial.id}`, { method: "PATCH", body }) : api("/bundles", { body })), () => close?.());
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("systems.name")}>
          <input className="field" required autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("systems.position")}>
          <input className="field" required placeholder={t("systems.positionPlaceholder")} value={position} onChange={(e) => setPosition(e.target.value)} />
        </Field>
      </div>
      <div>
        <span className="label">{t("systems.bundleSystems")}</span>
        <div className="space-y-2 rounded-2xl bg-cream p-3">
          {items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <select className="field" value={item.systemId} onChange={(e) => setItem(i, { systemId: e.target.value })} aria-label={t("step.system")}>
                <option value="">{t("systems.chooseSystem")}</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input className="field" value={item.accessLevel} placeholder={t("systems.level")} onChange={(e) => setItem(i, { accessLevel: e.target.value })} />
              <button
                type="button"
                aria-label={t("common.delete")}
                className="flex size-10 items-center justify-center rounded-full text-ink-mute hover:bg-paper hover:text-red"
                onClick={() => setItems((list) => list.filter((_, j) => j !== i))}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={16} />
              </button>
            </div>
          ))}
          <Button type="button" variant="ghost" onClick={() => setItems((list) => [...list, { systemId: "", accessLevel: "" }])}>
            <HugeiconsIcon icon={Add01Icon} size={16} />
            {t("systems.addItem")}
          </Button>
        </div>
      </div>
      <DialogActions pending={pending} label={initial ? t("common.save") : t("systems.newBundle")} />
    </form>
  );
}

export function AssetForm() {
  const t = useTranslations("assets");
  const to = useTranslations("ops2");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const empty = { type: "laptop", name: "", serialOrSeat: "", monthlyCost: "", currency: "USD" };
  const [v, setV] = useState(empty);
  const bind = (k: keyof typeof v) => ({ value: v[k], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value })), className: "field" });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const body = { ...v, serialOrSeat: v.serialOrSeat || null, monthlyCost: v.monthlyCost === "" ? null : Number(v.monthlyCost), currency: v.monthlyCost === "" ? null : v.currency };
        run(() => api("/assets", { body }), () => (setV(empty), close?.()));
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("kind")}>
          <select {...bind("type")}>
            {(["laptop", "phone", "license", "other"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`type.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("name")}>
          <input required autoFocus placeholder={to("assetNamePlaceholder")} {...bind("name")} />
        </Field>
        <Field label={t("serial")} className="sm:col-span-2">
          <input {...bind("serialOrSeat")} />
        </Field>
        <Field label={t("cost")}>
          <input type="number" min={0} step="0.01" {...bind("monthlyCost")} />
        </Field>
        <Field label={t("currency")}>
          <input maxLength={3} {...bind("currency")} />
        </Field>
      </div>
      <p className="text-xs text-ink-mute">{to("assetCostHint")}</p>
      <DialogActions pending={pending} label={t("newAsset")} />
    </form>
  );
}

export function AssetAssign({ assetId, assigned, people }: { assetId: string; assigned: boolean; people: Person[] }) {
  const t = useTranslations("assets");
  const to = useTranslations("ops2");
  const { error, pending, run } = useRun();
  const [employeeId, setEmployeeId] = useState("");
  if (assigned) {
    return (
      <span className="flex flex-col items-end gap-1">
        <Button variant="secondary" disabled={pending} onClick={() => run(() => api(`/assets/${assetId}/assignee`, { method: "PUT", body: { employeeId: null } }))}>
          <HugeiconsIcon icon={ArrowTurnBackwardIcon} size={16} />
          {t("return")}
        </Button>
        <ErrorBox error={error} />
      </span>
    );
  }
  return (
    <span className="flex flex-col items-end gap-1">
      <span className="flex gap-1.5">
        <select className="field w-44! py-1.5! text-xs!" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} aria-label={t("assignedTo")}>
          <option value="">{to("assignTo")}</option>
          {people.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Button disabled={pending || !employeeId} onClick={() => run(() => api(`/assets/${assetId}/assignee`, { method: "PUT", body: { employeeId } }))}>
          {t("assign")}
        </Button>
      </span>
      <ErrorBox error={error} />
    </span>
  );
}

export function DocumentUpload({ employeeId }: { employeeId: string }) {
  const t = useTranslations("profile");
  const to = useTranslations("ops2");
  const close = useModalClose();
  const { error, pending, run } = useRun();
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("contract");
  const [validTo, setValidTo] = useState("");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!file) return;
        run(
          async () => {
            const body = new FormData();
            body.append("file", file);
            body.append("type", type);
            body.append("validTo", validTo);
            const res = await fetch(`/api/v1/employees/${employeeId}/documents`, { method: "POST", body });
            if (!res.ok) throw new ApiRequestError((await res.json().catch(() => ({}))).error ?? { code: "internal_error" }, res.status);
          },
          () => (setFile(null), close?.()),
        );
      }}
    >
      <ErrorBox error={error} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={to("documentType")}>
          <select className="field" value={type} onChange={(e) => setType(e.target.value)}>
            {(["contract", "nda", "act", "invoice", "w9", "other"] as const).map((d) => (
              <option key={d} value={d}>
                {t(`docType.${d}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("validTo")}>
          <input type="date" className="field" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
        </Field>
      </div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-soft hover:bg-cream">
        <HugeiconsIcon icon={Upload04Icon} size={26} className="text-ink-mute" />
        <span className="font-medium text-ink-2">{file ? file.name : to("chooseFile")}</span>
        <input type="file" className="max-w-full text-xs" required onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <DialogActions pending={pending || !file} label={t("uploadDocument")} />
    </form>
  );
}
