import { readJson, route } from "@/server/http";
import { adjustBalance, getBalance } from "@/server/services/absences";

type P = { id: string };

export const GET = route<P>(({ actor, params }) => getBalance(actor, params.id));
/** Manual correction {amount, comment} — balances.adjust only. */
export const POST = route<P>(async ({ actor, req, params }) => adjustBalance(actor, params.id, await readJson(req)));
