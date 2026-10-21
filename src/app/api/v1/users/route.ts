import { readJson, route } from "@/server/http";
import { createAccess, listAccounts } from "@/server/services/users";

export const GET = route(({ actor }) => listAccounts(actor));
export const POST = route(async ({ actor, req }) => createAccess(actor, await readJson(req)));
