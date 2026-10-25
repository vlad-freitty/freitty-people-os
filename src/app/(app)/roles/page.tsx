import { Add01Icon, ShieldKeyIcon, UserGroupIcon } from "@hugeicons/core-free-icons";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sectionIcons } from "@/components/icons";
import { ModalButton } from "@/components/overlay";
import { NewRoleForm, RoleMatrix, UsersTable } from "@/components/roles-admin";
import { Card, PageTitle } from "@/components/ui";
import { getActor } from "@/server/auth/session";
import { PERMISSION_KEYS, PERMISSIONS } from "@/server/authz/permissions";
import { scopeOf } from "@/server/authz/policy";
import { listRoles, listUsers } from "@/server/services/roles";

export default async function RolesPage() {
  const actor = await getActor();
  const canManage = scopeOf(actor, "roles.manage") === "all";
  const canAssign = scopeOf(actor, "roles.assign") === "all";
  if (!canManage && !canAssign) notFound();
  const [roles, users, t] = await Promise.all([listRoles(actor), canAssign ? listUsers(actor) : [], getTranslations()]);
  const catalog = PERMISSION_KEYS.map((key) => ({ key, group: PERMISSIONS[key].group, scopes: [...PERMISSIONS[key].scopes] }));

  return (
    <>
      <PageTitle
        icon={sectionIcons.roles}
        subtitle={t("admin2.rolesSubtitle")}
        actions={
          canManage && (
            <ModalButton label={t("roles.newRole")} icon={Add01Icon} title={t("roles.newRole")} subtitle={t("admin2.newRoleHint")} modalIcon={ShieldKeyIcon}>
              <NewRoleForm roles={roles} />
            </ModalButton>
          )
        }
      >
        {t("roles.title")}
      </PageTitle>
      <div className="space-y-6">
        <Card icon={ShieldKeyIcon} tone="navy" title={t("admin2.matrixTitle")} subtitle={t("roles.intro")}>
          <RoleMatrix roles={roles} catalog={catalog} canManage={canManage} />
        </Card>
        {canAssign && (
          <Card icon={UserGroupIcon} tone="blue" title={t("roles.usersTab")} subtitle={t("admin2.usersHint", { n: users.length })}>
            <UsersTable users={users} roles={roles} isSuperadmin={actor.isSuperadmin} />
          </Card>
        )}
      </div>
    </>
  );
}
