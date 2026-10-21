import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { EmployeeForm } from "@/components/employee-form";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { can } from "@/server/authz/policy";
import { NotFoundError } from "@/server/errors";
import { getEmployee } from "@/server/services/employees";
import { employeeFormOptions } from "../../options";

export default async function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await getActor();
  const e = await getEmployee(actor, id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (e.access === "basic" || !can(actor, "employees.edit", { employeeId: e.id, departmentId: e.department.id })) notFound();
  const [t, options] = await Promise.all([getTranslations("employee"), employeeFormOptions(actor, e.department.id)]);

  return (
    <>
      <PageTitle>{t("editTitle")}</PageTitle>
      <Card>
        <EmployeeForm
          employeeId={e.id}
          {...options}
          initial={{
            firstName: e.firstName,
            lastName: e.lastName,
            workEmail: e.workEmail,
            phone: e.phone ?? "",
            photo: e.photo ?? "",
            departmentId: e.department.id,
            locationId: e.location?.id ?? "",
            position: e.position,
            managerId: e.manager?.id ?? "",
            employmentType: e.employmentType,
            grade: e.grade ?? "",
            hireDate: e.hireDate ?? "",
            probationEnd: e.probationEnd ?? "",
            birthDate: e.birthDate ?? "",
            showBirthday: e.showBirthday,
            status: e.status,
            locale: e.locale,
          }}
        />
      </Card>
    </>
  );
}
