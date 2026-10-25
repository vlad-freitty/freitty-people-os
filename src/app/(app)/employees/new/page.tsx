import { UserAdd01Icon } from "@hugeicons/core-free-icons";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmployeeForm, emptyEmployee } from "@/components/employee-form";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { employeeFormOptions } from "../options";

export default async function NewEmployeePage() {
  const actor = await getActor();
  const scope = scopeOf(actor, "employees.edit");
  if (!scope || scope === "self") notFound();
  const [t, options] = await Promise.all([getTranslations(), employeeFormOptions(actor)]);
  return (
    <>
      <PageTitle icon={UserAdd01Icon} subtitle={t("people2.createSubtitle")}>
        {t("employee.createTitle")}
      </PageTitle>
      <Card className="max-w-4xl">
        <EmployeeForm initial={emptyEmployee} {...options} />
      </Card>
    </>
  );
}
