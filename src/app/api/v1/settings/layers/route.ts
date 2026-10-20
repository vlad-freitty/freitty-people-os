import { readJson, route } from "@/server/http";
import { listLayers, upsertLayer } from "@/server/services/calendar";

export const GET = route(({ actor }) => listLayers(actor));
export const POST = route(async ({ actor, req }) => upsertLayer(actor, await readJson(req)));
