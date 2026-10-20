import { readJson, route } from "@/server/http";
import { listAssets, upsertAsset } from "@/server/services/assets";

export const GET = route(({ actor }) => listAssets(actor));
export const POST = route(async ({ actor, req }) => upsertAsset(actor, await readJson(req)));
