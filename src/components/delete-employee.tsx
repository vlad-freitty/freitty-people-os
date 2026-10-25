"use client";

import { Delete02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { api } from "./api";
import { ErrorBox } from "./error-box";
import { Button } from "./ui";

export function DeleteEmployeeButton({ employeeId }: { employeeId: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => {
          if (!confirm(t("employee.deleteConfirm"))) return;
          start(async () => {
            try {
              await api(`/employees/${employeeId}`, { method: "DELETE" });
              router.push("/employees");
              router.refresh();
            } catch (err) {
              setError(err);
            }
          });
        }}
      >
        <HugeiconsIcon icon={Delete02Icon} size={17} />
        {t("common.delete")}
      </Button>
      <ErrorBox error={error} />
    </>
  );
}
