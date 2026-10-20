import { readJson, route } from "@/server/http";
import { saveDraft } from "@/server/services/templates";

export const PUT = route<{ id: string }>(async ({ actor, req, params }) => saveDraft(actor, params.id, await readJson(req)));
