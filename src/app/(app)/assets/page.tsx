import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AssetAssign, AssetForm } from "@/components/directories";
import { Badge, Card, PageTitle } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { licenseCosts, listAssets } from "@/server/services/assets";
import { listEmployees } from "@/server/services/employees";

export default async function AssetsPage() {
  const actor = await getActor();
  if (scopeOf(actor, "assets.manage") !== "all") notFound();
  const [assets, costs, people, t, locale] = await Promise.all([listAssets(actor), licenseCosts(actor), listEmployees(actor), getTranslations("assets"), getLocale()]);
  const peopleOptions = people.filter((p) => p.access === "basic" || p.status !== "left").map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` }));

  return (
    <>
      <PageTitle>{t("title")}</PageTitle>
      <div className="mb-6 flex flex-wrap gap-4">
        {costs.map((c) => (
          <div key={c.currency ?? "-"} className="rounded-xl border border-line bg-paper p-4">
            <p className="label">{t("licenseTotal")}</p>
            <p className="font-display text-2xl">{c.currency ? formatMoney(c.total, c.currency, locale) : c.total}</p>
          </div>
        ))}
      </div>
      <div className="mb-6 overflow-x-auto rounded-xl border border-line bg-paper">
        <table className="table">
          <thead>
            <tr>
              <th>{t("kind")}</th>
              <th>{t("name")}</th>
              <th>{t("cost")}</th>
              <th>{t("assignedTo")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td>
                  <Badge>{t(`type.${a.type}`)}</Badge>
                </td>
                <td>
                  {a.name}
                  {a.serialOrSeat && <span className="block font-mono text-xs text-ink-mute">{a.serialOrSeat}</span>}
                </td>
                <td>{a.monthlyCost && a.currency ? formatMoney(a.monthlyCost, a.currency, locale) : "—"}</td>
                <td>
                  {a.assignedTo ? (
                    <Link className="underline" href={`/employees/${a.assignedTo.id}`}>
                      {a.assignedTo.name}
                    </Link>
                  ) : (
                    <span className="text-ink-mute">{t("free")}</span>
                  )}
                </td>
                <td>
                  <AssetAssign assetId={a.id} assigned={!!a.assignedTo} people={peopleOptions} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Card title={t("newAsset")}>
        <AssetForm />
      </Card>
    </>
  );
}
