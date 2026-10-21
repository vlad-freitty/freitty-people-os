import { readJson, route } from "@/server/http";
import { previewMyAbsence } from "@/server/services/requests";

export const POST = route(async ({ actor, req }) => previewMyAbsence(actor, await readJson(req)));
