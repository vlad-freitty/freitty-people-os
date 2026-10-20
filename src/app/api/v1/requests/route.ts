import { readJson, route, searchParams } from "@/server/http";
import { startRequest } from "@/server/requests/engine";
import { listRequests } from "@/server/services/requests";

export const GET = route(({ actor, req }) => listRequests(actor, searchParams(req)));
export const POST = route(async ({ actor, req }) => startRequest(actor, await readJson(req)));
