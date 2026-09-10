import { describe, expect, it } from "vitest";
import {
  PRESETS,
  configFromPreset,
  defaultThreshold,
  discardCapFor,
  maxDiscard,
  validateConfig,
} from "@/engine";

describe("discard cap", () => {
  it.each([
    [40, 4, 5],
    [40, 5, 3],
    [40, 6, 1],
    [40, 7, null],
    [40, 8, null],
    [52, 4, 5],
    [52, 5, 5],
    [52, 6, 3],
    [52, 7, 2],
    [52, 8, 1],
  ] as const)("deck %i with %i seated → %s", (deck, seated, expected) => {
    expect(discardCapFor(deck, seated)).toBe(expected);
  });

  it("throws for impossible seat counts", () => {
    expect(() => maxDiscard(40, 7)).toThrow();
    expect(maxDiscard(52, 8)).toBe(1);
  });
});

describe("config", () => {
  it("derives the threshold as 25% of the start", () => {
    expect(defaultThreshold(20)).toBe(5);
    expect(defaultThreshold(30)).toBe(8);
    expect(defaultThreshold(1000)).toBe(250);
    expect(defaultThreshold(2)).toBe(1);
  });

  it("every preset validates", () => {
    for (const id of Object.keys(PRESETS) as (keyof typeof PRESETS)[]) {
      expect(validateConfig(configFromPreset(id)), id).toEqual([]);
    }
    expect(validateConfig(configFromPreset("custom"))).toEqual([]);
  });

  it("liga preset is a 16-roster, 6-seat, 1000-point campaign", () => {
    const liga = configFromPreset("liga");
    expect(liga).toMatchObject({ mode: "campaign", rosterSize: 16, seats: 6, startingPoints: 1000, deck: 40 });
    expect(liga.forcedPlayThreshold).toBe(250);
  });

  it("rejects bad seat counts and rosters", () => {
    expect(validateConfig(configFromPreset("custom", { deck: 40, seats: 7, rosterSize: 7 }))).toContain("seatsRange");
    expect(validateConfig(configFromPreset("custom", { seats: 3, rosterSize: 3 }))).toContain("seatsRange");
    expect(
      validateConfig(configFromPreset("custom", { mode: "campaign", seats: 4, rosterSize: 17 })),
    ).toContain("rosterRange");
    expect(
      validateConfig(configFromPreset("custom", { mode: "campaign", seats: 6, rosterSize: 5 })),
    ).toContain("rosterRange");
    expect(
      validateConfig({ ...configFromPreset("normal"), rosterSize: 5 }),
    ).toContain("rosterSession");
    expect(validateConfig(configFromPreset("normal", { forcedPlayThreshold: 25 }))).toContain("forcedPlayThreshold");
  });
});
