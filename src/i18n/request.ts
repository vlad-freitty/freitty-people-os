import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getActorOrNull } from "@/server/auth/session";
import { getProfileLocale, LOCALE_COOKIE } from "@/server/services/me";

export const LOCALES = ["uk", "en"] as const;
export type AppLocale = (typeof LOCALES)[number];

const isLocale = (v: unknown): v is AppLocale => LOCALES.includes(v as AppLocale);

// The profile (Employee.locale) is the source of truth for signed-in users (PRD 7). The cookie covers
// the login page and users without an employee profile. No locale in the URL — this is an internal app.
export default getRequestConfig(async () => {
  const actor = await getActorOrNull();
  const fromProfile = actor ? await getProfileLocale(actor) : null;
  const fromCookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale: AppLocale = isLocale(fromProfile) ? fromProfile : isLocale(fromCookie) ? fromCookie : "uk";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "UTC",
  };
});
