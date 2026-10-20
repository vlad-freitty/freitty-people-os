import { readJson, route } from "@/server/http";
import { listSystems, upsertSystem } from "@/server/services/systems";

export const GET = route(({ actor }) => listSystems(actor));
export const POST = route(async ({ actor, req }) => upsertSystem(actor, await readJson(req)));
