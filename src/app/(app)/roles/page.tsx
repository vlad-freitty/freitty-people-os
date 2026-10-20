import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
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
  const [roles, users, t] = await Promise.all([listRoles(actor), canAssign ? listUsers(actor) : [], getTranslations("roles")]);
  const catalog = PERMISSION_KEYS.map((key) => ({ key, group: PERMISSIONS[key].group, scopes: [...PERMISSIONS[key].scopes] }));

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-ink-soft">{t("intro")}</p>
      <div className="space-y-6">
        <Card title={t("rolesTab")}>
          <RoleMatrix roles={roles} catalog={catalog} canManage={canManage} />
        </Card>
        {canManage && (
          <Card title={t("newRole")}>
            <NewRoleForm roles={roles} />
          </Card>
        )}
        {canAssign && (
          <Card title={t("usersTab")}>
            <UsersTable users={users} roles={roles} isSuperadmin={actor.isSuperadmin} />
          </Card>
        )}
      </div>
    </>
  );
}
