import { readJson, route } from "@/server/http";
import { calendarFeedUrl } from "@/server/services/calendar";

/** Body {rotate?: boolean}: returns the personal ICS subscription path, optionally issuing a new secret. */
export const POST = route(async ({ actor, req }) => {
  const body = (await readJson(req)) as { rotate?: boolean };
  return calendarFeedUrl(actor, body.rotate === true);
});
