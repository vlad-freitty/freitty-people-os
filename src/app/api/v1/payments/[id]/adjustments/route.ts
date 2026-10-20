import { readJson, route } from "@/server/http";
import { addAdjustment } from "@/server/services/payments";

/** Body {amount, comment} — a correction line; calculated sums are never edited. */
export const POST = route<{ id: string }>(async ({ actor, req, params }) => addAdjustment(actor, params.id, await readJson(req)));
