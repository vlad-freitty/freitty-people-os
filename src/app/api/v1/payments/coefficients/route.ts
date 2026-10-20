import { readJson, route } from "@/server/http";
import { listShiftCoefficients, setShiftCoefficient } from "@/server/services/payments";

export const GET = route(({ actor }) => listShiftCoefficients(actor));
/** Body {companyId, coefficient} */
export const PUT = route(async ({ actor, req }) => setShiftCoefficient(actor, await readJson(req)));
