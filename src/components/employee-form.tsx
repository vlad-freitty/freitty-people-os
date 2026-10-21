"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button, Field } from "./ui";

export type EmployeeFormValues = {
  firstName: string;
  lastName: string;
  workEmail: string;
  phone: string;
  photo: string;
  departmentId: string;
  locationId: string;
  position: string;
  managerId: string;
  employmentType: "employee" | "contractor";
  grade: "" | "senior_management" | "middle_management" | "first_line_management" | "individual_contributor";
  hireDate: string;
  probationEnd: string;
  birthDate: string;
  showBirthday: boolean;
  status: "candidate" | "onboarding" | "active" | "offboarding" | "left";
  locale: "uk" | "en";
};

export const emptyEmployee: EmployeeFormValues = {
  firstName: "",
  lastName: "",
  workEmail: "",
  phone: "",
  photo: "",
  departmentId: "",
  locationId: "",
  position: "",
  managerId: "",
  employmentType: "employee",
  grade: "",
  hireDate: "",
  probationEnd: "",
  birthDate: "",
  showBirthday: true,
  status: "active",
  locale: "uk",
};

type Option = { id: string; label: string };

export function EmployeeForm({
  employeeId,
  initial,
  departments,
  locations,
  managers,
}: {
  employeeId?: string;
  initial: EmployeeFormValues;
  departments: Option[];
  locations: Option[];
  managers: Option[];
}) {
  const t = useTranslations();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof EmployeeFormValues>(k: K, value: EmployeeFormValues[K]) => setV((s) => ({ ...s, [k]: value }));
  const bind = (k: keyof EmployeeFormValues) => ({
    value: v[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => set(k, e.target.value as never),
    className: "field",
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const nullable = (s: string) => (s.trim() === "" ? null : s.trim());
    const body = {
      ...v,
      phone: nullable(v.phone),
      photo: nullable(v.photo),
      locationId: nullable(v.locationId),
      managerId: nullable(v.managerId),
      grade: nullable(v.grade),
      hireDate: nullable(v.hireDate),
      probationEnd: nullable(v.probationEnd),
      birthDate: nullable(v.birthDate),
    };
    start(async () => {
      try {
        const saved = await api<{ id: string }>(employeeId ? `/employees/${employeeId}` : "/employees", {
          method: employeeId ? "PATCH" : "POST",
          body,
        });
        router.push(`/employees/${saved.id}`);
        router.refresh();
      } catch (err) {
        setError(err);
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <ErrorBox error={error} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("employee.firstName")}>
          <input required {...bind("firstName")} />
        </Field>
        <Field label={t("employee.lastName")}>
          <input required {...bind("lastName")} />
        </Field>
        <Field label={t("employee.workEmail")}>
          <input required type="email" {...bind("workEmail")} />
        </Field>
        <Field label={t("employee.phone")}>
          <input {...bind("phone")} />
        </Field>
        <Field label={t("employee.position")}>
          <input required {...bind("position")} />
        </Field>
        <Field label={t("employee.department")}>
          <select required {...bind("departmentId")}>
            <option value="" />
            {departments.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.location")}>
          <select {...bind("locationId")}>
            <option value="">{t("common.none")}</option>
            {locations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.manager")}>
          <select {...bind("managerId")}>
            <option value="">{t("common.none")}</option>
            {managers
              .filter((m) => m.id !== employeeId)
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
          </select>
        </Field>
        <Field label={t("employee.employmentType")}>
          <select {...bind("employmentType")}>
            {(["employee", "contractor"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`employmentType.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.grade")}>
          <select {...bind("grade")}>
            <option value="">{t("common.none")}</option>
            {(["senior_management", "middle_management", "first_line_management", "individual_contributor"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`grade.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.status")}>
          <select {...bind("status")}>
            {(["candidate", "onboarding", "active", "offboarding", "left"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`status.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.hireDate")}>
          <input type="date" {...bind("hireDate")} />
        </Field>
        <Field label={t("employee.probationEnd")}>
          <input type="date" {...bind("probationEnd")} />
        </Field>
        <Field label={t("employee.birthDate")}>
          <input type="date" {...bind("birthDate")} />
        </Field>
        <Field label={t("employee.locale")}>
          <select {...bind("locale")}>
            {(["uk", "en"] as const).map((x) => (
              <option key={x} value={x}>
                {t(`locales.${x}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("employee.photo")} className="sm:col-span-2">
          <input type="url" {...bind("photo")} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.showBirthday} onChange={(e) => set("showBirthday", e.target.checked)} />
        {t("employee.showBirthday")}
      </label>
      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {employeeId ? t("common.save") : t("common.create")}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
