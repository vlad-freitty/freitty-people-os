import { readJson, route } from "@/server/http";
import { importShifts } from "@/server/services/shifts";

/** Body {csv, commit?} — without commit it only previews. */
export const POST = route(async ({ actor, req }) => importShifts(actor, await readJson(req)));
