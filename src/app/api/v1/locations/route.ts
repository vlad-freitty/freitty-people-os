import { readJson, route } from "@/server/http";
import { upsertLocation } from "@/server/services/org";

export const POST = route(async ({ actor, req }) => upsertLocation(actor, await readJson(req)));
