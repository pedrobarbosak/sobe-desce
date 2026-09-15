import { describe, expect, it } from "vitest";
import { PARTY_TWIST_ICONS } from "@/components/table/partyIcons";
import { TWISTS } from "@/engine";

describe("Party event icons", () => {
  it("gives every active round event its own icon", () => {
    const icons = TWISTS.map((twist) => PARTY_TWIST_ICONS[twist]);
    expect(icons.every(Boolean)).toBe(true);
    expect(new Set(icons).size).toBe(TWISTS.length);
  });
});
