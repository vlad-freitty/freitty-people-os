import { readJson, route } from "@/server/http";
import { getNotificationSettings, setNotificationPrefs } from "@/server/services/notifications";

export const GET = route(({ actor }) => getNotificationSettings(actor));
/** Body {step_assigned: {in_app, telegram}, …} */
export const PUT = route(async ({ actor, req }) => setNotificationPrefs(actor, await readJson(req)));
