import { readJson, route } from "@/server/http";
import { listAbsenceTypes, upsertAbsenceType } from "@/server/services/absences";

export const GET = route(({ actor }) => listAbsenceTypes(actor));
export const POST = route(async ({ actor, req }) => upsertAbsenceType(actor, await readJson(req)));
