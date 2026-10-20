import { readJson, route } from "@/server/http";
import { commentOnRequest } from "@/server/services/requests";

export const POST = route<{ id: string }>(async ({ actor, req, params }) => commentOnRequest(actor, params.id, await readJson(req)));
