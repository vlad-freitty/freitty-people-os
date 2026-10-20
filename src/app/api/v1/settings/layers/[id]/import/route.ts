import { readJson, route } from "@/server/http";
import { importEvents } from "@/server/services/calendar";

/** Body {format: "ics" | "csv", content, commit?} — without commit it only previews. */
export const POST = route<{ id: string }>(async ({ actor, req, params }) => importEvents(actor, params.id, await readJson(req)));
