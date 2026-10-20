import { readJson, route } from "@/server/http";
import { addRate, listRates } from "@/server/services/employees";

type P = { id: string };

export const GET = route<P>(({ actor, params }) => listRates(actor, params.id));
export const POST = route<P>(async ({ actor, req, params }) => addRate(actor, params.id, await readJson(req)));
