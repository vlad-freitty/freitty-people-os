import { readJson, route } from "@/server/http";
import { listBundles, upsertBundle } from "@/server/services/systems";

export const GET = route(({ actor }) => listBundles(actor));
export const POST = route(async ({ actor, req }) => upsertBundle(actor, await readJson(req)));
