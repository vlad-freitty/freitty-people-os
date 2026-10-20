import { readJson, route } from "@/server/http";
import { getTemplate, updateTemplateMeta } from "@/server/services/templates";

type P = { id: string };

export const GET = route<P>(({ actor, params }) => getTemplate(actor, params.id));
export const PATCH = route<P>(async ({ actor, req, params }) => updateTemplateMeta(actor, params.id, await readJson(req)));
