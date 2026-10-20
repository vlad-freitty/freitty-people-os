import { readJson, route } from "@/server/http";
import { markRead } from "@/server/services/notifications";

/** Body {ids?: string[]} — without ids marks everything as read */
export const POST = route(async ({ actor, req }) => markRead(actor, await readJson(req)));
