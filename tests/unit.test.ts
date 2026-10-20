import { describe, expect, it } from "vitest";
import { addMonths, isIsoDate, parseIsoDate, toMonthDay } from "@/lib/dates";
import { planRateAppend, rateAt } from "@/server/rates";

const d = parseIsoDate;

describe("dates", () => {
  it("validates calendar dates strictly", () => {
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2025-02-29")).toBe(false);
    expect(isIsoDate("2025-13-01")).toBe(false);
    expect(isIsoDate("01.02.2025")).toBe(false);
  });

  it("hire on Feb 29: anniversaries clamp to Feb 28 in non-leap years", () => {
    expect(addMonths(d("2024-02-29"), 12).toISOString().slice(0, 10)).toBe("2025-02-28");
    expect(addMonths(d("2024-02-29"), 48).toISOString().slice(0, 10)).toBe("2028-02-29");
    expect(addMonths(d("2024-01-31"), 1).toISOString().slice(0, 10)).toBe("2024-02-29");
  });

  it("birthday is shown without the year and never shifts by time zone", () => {
    expect(toMonthDay(d("1992-02-29"))).toBe("02-29");
    expect(toMonthDay(d("1990-12-31"))).toBe("12-31");
  });
});

describe("rate history", () => {
  const rates = [
    { id: "a", effectiveFrom: d("2025-01-01"), effectiveTo: d("2025-06-14") },
    { id: "b", effectiveFrom: d("2025-06-15"), effectiveTo: null },
  ];

  it("picks the rate in force on a date, including a change in the middle of a period", () => {
    expect(rateAt(rates, d("2024-12-31"))).toBeNull();
    expect(rateAt(rates, d("2025-01-01"))?.id).toBe("a");
    expect(rateAt(rates, d("2025-06-14"))?.id).toBe("a");
    expect(rateAt(rates, d("2025-06-15"))?.id).toBe("b");
    expect(rateAt(rates, d("2030-01-01"))?.id).toBe("b");
  });

  it("appending closes the open rate the day before and never rewrites history", () => {
    const plan = planRateAppend(rates, d("2026-03-01"));
    expect(plan).toEqual({ ok: true, close: { id: "b", effectiveTo: d("2026-02-28") } });
    expect(planRateAppend(rates, d("2025-06-15")).ok).toBe(false);
    expect(planRateAppend(rates, d("2025-03-01")).ok).toBe(false);
    expect(planRateAppend([], d("2025-03-01"))).toEqual({ ok: true, close: null });
  });
});
