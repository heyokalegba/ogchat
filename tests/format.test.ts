import { describe, expect, it } from "vitest";
import { stopwatch } from "@/lib/format";

describe("stopwatch", () => {
  it("reads like a stopwatch", () => {
    expect(stopwatch(0)).toBe("0:00");
    expect(stopwatch(7_400)).toBe("0:07");
    expect(stopwatch(161_000)).toBe("2:41");
    expect(stopwatch(3_729_000)).toBe("1:02:09");
    expect(stopwatch(-5)).toBe("0:00");
  });
});
