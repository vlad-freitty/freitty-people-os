import { readJson, route } from "@/server/http";
import { upsertAbsenceType } from "@/server/services/absences";

export const PATCH = route<{ id: string }>(async ({ actor, req, params }) => upsertAbsenceType(actor, await readJson(req), params.id));
