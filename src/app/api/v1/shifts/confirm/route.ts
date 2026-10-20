import { readJson, route } from "@/server/http";
import { confirmShifts } from "@/server/services/shifts";

/** Body {ids: string[]} */
export const POST = route(async ({ actor, req }) => confirmShifts(actor, await readJson(req)));
