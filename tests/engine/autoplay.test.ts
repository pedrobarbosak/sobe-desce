import { describe, expect, it } from "vitest";
import { CLASSIC_RULES, HIDDEN_CARD, type TrickInProgress, obviousPlay } from "@/engine";

const led = (card: string): TrickInProgress => ({ leader: 1, plays: [{ seat: 1, card: card as never }] });

describe("obvious play", () => {
  it("plays the only legal card", () => {
    // Must follow hearts, and holds one.
    expect(obviousPlay(["7H", "2S", "9D"], led("KH"), "S", 52, CLASSIC_RULES)).toBe("7H");
    // Only one card left at all.
    expect(obviousPlay(["4C"], { leader: 1, plays: [] }, "S", 52, CLASSIC_RULES)).toBe("4C");
    // The climb rule leaves one card: the Ace has to go over the King.
    expect(obviousPlay(["AH", "QH", "2S"], led("KH"), "S", 52, CLASSIC_RULES)).toBe("AH");
  });

  it("throws away the weakest card when nothing in hand can win", () => {
    // No hearts, no trumps: anything goes, and the 2 is the one to lose.
    expect(obviousPlay(["5D", "9D", "2C"], led("KH"), "S", 52, CLASSIC_RULES)).toBe("2C");
    // Playing to lose, the strongest card is the one to shed.
    expect(obviousPlay(["5D", "9D", "2C"], led("KH"), "S", 52, { ...CLASSIC_RULES, avoidTricks: true })).toBe("9D");
    // Low card wins: the "weakest" card is the highest one.
    expect(obviousPlay(["5D", "9D", "2C"], led("3H"), "S", 52, { ...CLASSIC_RULES, lowWins: true })).toBe("9D");
  });

  it("leaves real choices to the player", () => {
    // Leading: anything goes, so nothing is obvious.
    expect(obviousPlay(["7H", "2S"], { leader: 1, plays: [] }, "S", 52, CLASSIC_RULES)).toBeNull();
    // Two cards that beat the King: which one is a decision.
    expect(obviousPlay(["AH", "QH", "2S"], led("3H"), "S", 52, CLASSIC_RULES)).toBeNull();
    // A trump that wins: the choice is whether to spend it.
    expect(obviousPlay(["2S", "9D", "5C"], led("KH"), "S", 52, { ...CLASSIC_RULES, freeForAll: true })).toBeNull();
    // A card of the trick still face down: nothing can be judged.
    expect(obviousPlay(["5D", "9D", "2C"], led(HIDDEN_CARD), "S", 52, { ...CLASSIC_RULES, fog: true })).toBeNull();
    // Nothing to play from.
    expect(obviousPlay([], led("KH"), "S", 52, CLASSIC_RULES)).toBeNull();
  });
});
