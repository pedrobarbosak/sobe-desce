import { describe, expect, it } from "vitest";
import { buildDeck, isCard, rankValue, sortHand, suitOf, rankOf } from "@/engine";

describe("cards", () => {
  it("builds 40 and 52 card decks without 8/9/10 in the short deck", () => {
    const d40 = buildDeck(40);
    const d52 = buildDeck(52);
    expect(d40).toHaveLength(40);
    expect(d52).toHaveLength(52);
    expect(new Set(d40).size).toBe(40);
    expect(new Set(d52).size).toBe(52);
    expect(d40).not.toContain("8H");
    expect(d40).not.toContain("10S");
    expect(d52).toContain("10S");
  });

  it("ranks A > 7 > K > J > Q > 6 in the 40 deck", () => {
    const order = ["AH", "7H", "KH", "JH", "QH", "6H", "5H", "4H", "3H", "2H"] as const;
    for (let i = 0; i < order.length - 1; i++) {
      expect(rankValue(order[i]!, 40)).toBeGreaterThan(rankValue(order[i + 1]!, 40));
    }
  });

  it("slots 10, 9, 8 between Q and 6 in the 52 deck", () => {
    expect(rankValue("QS", 52)).toBeGreaterThan(rankValue("10S", 52));
    expect(rankValue("10S", 52)).toBeGreaterThan(rankValue("9S", 52));
    expect(rankValue("8S", 52)).toBeGreaterThan(rankValue("6S", 52));
    expect(rankValue("AS", 52)).toBeGreaterThan(rankValue("7S", 52));
    expect(rankValue("7S", 52)).toBeGreaterThan(rankValue("KS", 52));
  });

  it("parses suit and rank, including 10", () => {
    expect(suitOf("10D")).toBe("D");
    expect(rankOf("10D")).toBe("10");
    expect(isCard("10D", 40)).toBe(false);
    expect(isCard("10D", 52)).toBe(true);
    expect(isCard("ZZ", 52)).toBe(false);
    expect(isCard(42, 52)).toBe(false);
  });

  it("sorts trump first then strongest first", () => {
    expect(sortHand(["2S", "AH", "7C", "KH", "AC"], 40, "C")).toEqual(["AC", "7C", "AH", "KH", "2S"]);
  });
});
