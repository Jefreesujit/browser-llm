import { afterEach, describe, expect, it, vi } from "vitest";

import { formatRelativeDate } from "../format";

describe("formatRelativeDate", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("uses relative labels instead of fixed dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));

    expect(formatRelativeDate("2026-05-03T23:59:00.000Z")).toBe("1m");
    expect(formatRelativeDate("2026-05-03T23:00:00.000Z")).toBe("1h");
    expect(formatRelativeDate("2026-05-01T00:00:00.000Z")).toBe("3d");
    expect(formatRelativeDate("2026-04-06T00:00:00.000Z")).toBe("4w");
    expect(formatRelativeDate("2026-03-20T00:00:00.000Z")).toBe("1mo");
    expect(formatRelativeDate("2025-05-04T00:00:00.000Z")).toBe("1y");
  });
});
