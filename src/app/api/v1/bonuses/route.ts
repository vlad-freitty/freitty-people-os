import { route, searchParams } from "@/server/http";
import { listBonuses } from "@/server/services/payments";

export const GET = route(({ actor, req }) => listBonuses(actor, searchParams(req)));
