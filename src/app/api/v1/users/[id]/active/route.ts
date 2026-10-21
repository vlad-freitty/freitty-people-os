import { readJson, route } from "@/server/http";
import { setAccountActive } from "@/server/services/users";

export const PUT = route<{ id: string }>(async ({ actor, req, params }) => setAccountActive(actor, params.id, await readJson(req)));
