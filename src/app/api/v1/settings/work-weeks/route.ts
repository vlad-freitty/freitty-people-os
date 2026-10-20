import { readJson, route } from "@/server/http";
import { listWorkWeeks, upsertWorkWeek } from "@/server/services/calendar";

export const GET = route(({ actor }) => listWorkWeeks(actor));
export const PUT = route(async ({ actor, req }) => upsertWorkWeek(actor, await readJson(req)));
