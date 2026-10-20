import { readJson, route } from "@/server/http";
import { listPolicies, upsertPolicy } from "@/server/services/absences";

export const GET = route(({ actor }) => listPolicies(actor));
export const POST = route(async ({ actor, req }) => upsertPolicy(actor, await readJson(req)));
