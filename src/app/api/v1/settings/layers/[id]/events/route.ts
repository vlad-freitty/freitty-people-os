import { readJson, route } from "@/server/http";
import { listEvents, upsertEvent } from "@/server/services/calendar";

type P = { id: string };

export const GET = route<P>(({ actor, params }) => listEvents(actor, params.id));
export const POST = route<P>(async ({ actor, req, params }) => upsertEvent(actor, params.id, await readJson(req)));
