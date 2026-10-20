import { readJson, route } from "@/server/http";
import { setMyLocale } from "@/server/services/me";

export const PUT = route(async ({ actor, req }) => {
  const body = (await readJson(req)) as { locale?: unknown };
  return setMyLocale(actor, body.locale);
});
