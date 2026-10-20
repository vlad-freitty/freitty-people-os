import { readJson, route } from "@/server/http";
import { createTemplate, listTemplates } from "@/server/services/templates";

export const GET = route(({ actor }) => listTemplates(actor));
export const POST = route(async ({ actor, req }) => createTemplate(actor, await readJson(req)));
