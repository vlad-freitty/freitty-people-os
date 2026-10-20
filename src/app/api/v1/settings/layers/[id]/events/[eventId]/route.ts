import { readJson, route } from "@/server/http";
import { deleteEvent, upsertEvent } from "@/server/services/calendar";

type P = { id: string; eventId: string };

export const PATCH = route<P>(async ({ actor, req, params }) => upsertEvent(actor, params.id, await readJson(req), params.eventId));
export const DELETE = route<P>(({ actor, params }) => deleteEvent(actor, params.id, params.eventId));
