import { describe, expect, it } from "vitest";

import { formatMinor, localDateValue, localMonthValue, monthStartValue } from "./format";

describe("currency formatting", () => {
  it("uses the narrow Dollar symbol", () => {
    const formatted = formatMinor(12345, "USD", "es-CR", 2);

    expect(formatted).toContain("$");
    expect(formatted).not.toContain("USD");
    expect(formatted).not.toContain("US$");
  });

  it("uses the Euro symbol", () => {
    const formatted = formatMinor(12345, "EUR", "es-CR", 2);

    expect(formatted).toContain("€");
    expect(formatted).not.toContain("EUR");
  });
});

describe("local calendar values", () => {
  it("keeps the Costa Rica calendar date during local evening hours", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/Costa_Rica";

    const instant = new Date("2026-07-14T02:30:00.000Z");
    expect(localDateValue(instant)).toBe("2026-07-13");
    expect(localMonthValue(instant)).toBe("2026-07");

    process.env.TZ = previousTimezone;
  });

  it("keeps month and year boundaries in local calendar time", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/Costa_Rica";

    const instant = new Date("2027-01-01T03:00:00.000Z");
    expect(localDateValue(instant)).toBe("2026-12-31");
    expect(localMonthValue(instant)).toBe("2026-12");
    expect(monthStartValue("2026-12-31")).toBe("2026-12-01");

    process.env.TZ = previousTimezone;
  });
});
