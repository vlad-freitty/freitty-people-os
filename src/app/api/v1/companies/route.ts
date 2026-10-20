import { readJson, route } from "@/server/http";
import { upsertCompany } from "@/server/services/org";

export const POST = route(async ({ actor, req }) => upsertCompany(actor, await readJson(req)));
