import { Add01Icon, LaptopIcon, LicenseIcon, PackageIcon, SmartPhone01Icon } from "@hugeicons/core-free-icons";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AssetAssign, AssetForm } from "@/components/directories";
import { sectionIcons } from "@/components/icons";
import { ModalButton } from "@/components/overlay";
import { Avatar, Badge, Card, EmptyState, IconTile, PageTitle, Stat } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import { getActor } from "@/server/auth/session";
import { scopeOf } from "@/server/authz/policy";
import { licenseCosts, listAssets } from "@/server/services/assets";
import { listEmployees } from "@/server/services/employees";

const TYPE_ICON = { laptop: LaptopIcon, phone: SmartPhone01Icon, license: LicenseIcon, other: PackageIcon } as const;
const TYPE_TONE = { laptop: "blue", phone: "ok", license: "warn", other: "neutral" } as const;

export default async function AssetsPage() {
  const actor = await getActor();
  if (scopeOf(actor, "assets.manage") !== "all") notFound();
  const [assets, costs, people, t, to, locale] = await Promise.all([
    listAssets(actor),
    licenseCosts(actor),
    listEmployees(actor),
    getTranslations("assets"),
    getTranslations("ops2"),
    getLocale(),
  ]);
  const peopleOptions = people.filter((p) => p.access === "basic" || p.status !== "left").map((p) => ({ id: p.id, label: `${p.lastName} ${p.firstName}` }));
  const assigned = assets.filter((a) => a.assignedTo).length;
  const newAsset = (variant: "primary" | "secondary" = "primary") => (
    <ModalButton label={t("newAsset")} icon={Add01Icon} variant={variant} title={t("newAsset")} modalIcon={sectionIcons.assets}>
      <AssetForm />
    </ModalButton>
  );

  return (
    <>
      <PageTitle icon={sectionIcons.assets} subtitle={to("assetsSubtitle")} actions={newAsset()}>
        {t("title")}
      </PageTitle>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={to("assetsTotal")} value={assets.length} />
        <Stat label={to("assetsAssigned")} value={assigned} tone="ok" />
        <Stat label={to("assetsFree")} value={assets.length - assigned} tone="warn" />
        {costs.length === 0 ? (
          <Stat label={t("licenseTotal")} value="—" />
        ) : (
          costs.map((c) => <Stat key={c.currency ?? "-"} label={t("licenseTotal")} value={c.currency ? formatMoney(c.total, c.currency, locale) : c.total} />)
        )}
      </div>

      <Card icon={LaptopIcon} tone="blue" title={to("assetsList")} subtitle={to("assetsCount", { n: assets.length })}>
        {assets.length === 0 ? (
          <EmptyState icon={LaptopIcon} title={to("assetsEmpty")} hint={to("assetsEmptyHint")} action={newAsset()} />
        ) : (
          <div className="-mx-5 overflow-x-auto border-t border-line">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("name")}</th>
                  <th>{t("cost")}</th>
                  <th>{t("assignedTo")}</th>
                  <th className="text-right">{to("actions")}</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="flex items-center gap-3">
                        <IconTile icon={TYPE_ICON[a.type]} tone={TYPE_TONE[a.type]} size={36} />
                        <span className="min-w-0">
                          <span className="block font-medium text-ink-2">{a.name}</span>
                          <span className="block text-xs text-ink-mute">
                            {t(`type.${a.type}`)}
                            {a.serialOrSeat && <span className="font-mono"> · {a.serialOrSeat}</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className="font-mono whitespace-nowrap">{a.monthlyCost && a.currency ? formatMoney(a.monthlyCost, a.currency, locale) : "—"}</td>
                    <td>
                      {a.assignedTo ? (
                        <Link className="flex items-center gap-2 hover:text-red" href={`/employees/${a.assignedTo.id}`}>
                          <Avatar name={a.assignedTo.name} />
                          <span className="font-medium whitespace-nowrap">{a.assignedTo.name}</span>
                        </Link>
                      ) : (
                        <Badge tone="warn">{t("free")}</Badge>
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
        )}
      </Card>
    </>
  );
}
