import { readJson, route, searchParams } from "@/server/http";
import { createPeriod, listPeriods } from "@/server/services/payments";

export const GET = route(({ actor, req }) => listPeriods(actor, searchParams(req)));
export const POST = route(async ({ actor, req }) => createPeriod(actor, await readJson(req)));
