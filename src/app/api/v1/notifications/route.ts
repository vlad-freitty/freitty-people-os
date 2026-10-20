import { route, searchParams } from "@/server/http";
import { listNotifications } from "@/server/services/notifications";

/** ?unread=true — the signed-in user's in-app notifications */
export const GET = route(({ actor, req }) => listNotifications(actor, searchParams(req)));
