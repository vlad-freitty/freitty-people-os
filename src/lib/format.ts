/** Date-only values ("YYYY-MM-DD") are calendar dates — format them in UTC so they never shift a day. */
export function formatDate(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value}T00:00:00Z`),
  );
}

/** "MM-DD" → "14 березня" / "March 14" */
export function formatMonthDay(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  return new Intl.DateTimeFormat(locale === "uk" ? "uk-UA" : "en-US", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(`2000-${value}T00:00:00Z`),
  );
}

export function formatMoney(amount: string, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale === "uk" ? "uk-UA" : "en-US", { style: "currency", currency }).format(Number(amount));
}

/** Localized content fields (PRD 7): EN falls back to UA when empty. */
export function localized(locale: string, uk: string, en?: string | null): string {
  return locale === "en" && en ? en : uk;
}
