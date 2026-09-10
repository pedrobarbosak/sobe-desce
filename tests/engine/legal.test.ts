import { describe, expect, it } from "vitest";
import { type Card, canSitOut, illegalReason, legalPlays, sitOutBlockedReason, trickWinner } from "@/engine";

const trick = (leader: number, ...plays: Card[]) => ({
  leader,
  plays: plays.map((card, i) => ({ seat: (leader + i) % 4, card })),
});

describe("legalPlays", () => {
  it("must lead the Ace of trumps when holding it", () => {
    expect(legalPlays(["AS", "2H", "KD"], trick(0), "S", 40)).toEqual(["AS"]);
    expect(legalPlays(["7S", "2H", "KD"], trick(0), "S", 40)).toEqual(["7S", "2H", "KD"]);
  });

  it("must follow suit", () => {
    expect(legalPlays(["2H", "KD", "AS"], trick(0, "3H"), "S", 40)).toEqual(["2H"]);
  });

  it("sobe: must beat the winning card when following suit and able", () => {
    // 5H led, winning; hand has 2H (cannot beat) and KH (can) → only KH
    expect(legalPlays(["2H", "KH", "AS"], trick(0, "5H"), "S", 40)).toEqual(["KH"]);
    // Nothing beats → any heart
    expect(legalPlays(["2H", "3H", "AS"], trick(0, "5H"), "S", 40)).toEqual(["2H", "3H"]);
  });

  it("sobe does not apply to the led suit once a trump is winning", () => {
    // 5H led, then 2S trumps; hand has AH → cannot beat the trump, any heart is fine
    expect(legalPlays(["AH", "2H", "KD"], trick(0, "5H", "2S"), "S", 40)).toEqual(["AH", "2H"]);
  });

  it("must trump when void in the led suit", () => {
    expect(legalPlays(["2S", "KD", "QC"], trick(0, "5H"), "S", 40)).toEqual(["2S"]);
  });

  it("sobe: must over-trump when able", () => {
    // 5H led, 4S trumped; hand has 2S and 7S → must play 7S
    expect(legalPlays(["2S", "7S", "KD"], trick(0, "5H", "4S"), "S", 40)).toEqual(["7S"]);
  });

  it("a trump too low to win frees the hand", () => {
    // 5H led, 4S trumped; the only trump left cannot beat it → play anything
    expect(legalPlays(["2S", "KD"], trick(0, "5H", "4S"), "S", 40)).toEqual(["2S", "KD"]);
  });

  it("void in both: anything goes", () => {
    expect(legalPlays(["KD", "QC", "2C"], trick(0, "5H", "4S"), "S", 40)).toEqual(["KD", "QC", "2C"]);
  });

  it("trump led counts as following suit with sobe", () => {
    expect(legalPlays(["2S", "KS", "AH"], trick(0, "7S"), "S", 40)).toEqual(["2S", "KS"]);
    expect(legalPlays(["2S", "AS", "AH"], trick(0, "7S"), "S", 40)).toEqual(["AS"]);
  });

  it("explains why a card is illegal", () => {
    expect(illegalReason(["AS", "2H"], "2H", trick(0), "S", 40)).toBe("mustLeadTrumpAce");
    expect(illegalReason(["2H", "KD"], "KD", trick(0, "5H"), "S", 40)).toBe("mustFollowSuit");
    expect(illegalReason(["2H", "KH"], "2H", trick(0, "5H"), "S", 40)).toBe("mustClimb");
    expect(illegalReason(["2S", "KD"], "KD", trick(0, "5H"), "S", 40)).toBe("mustTrump");
    expect(illegalReason(["2S", "7S"], "2S", trick(0, "5H", "4S"), "S", 40)).toBe("mustClimb");
    expect(illegalReason(["2S", "7S"], "7S", trick(0, "5H", "4S"), "S", 40)).toBeNull();
    expect(illegalReason(["2S"], "AH", trick(0), "S", 40)).toBe("notInHand");
  });
});

describe("trickWinner", () => {
  it("highest of led suit wins without trumps", () => {
    expect(trickWinner(trick(1, "5H", "KH", "AD", "2H").plays, "S", 40)).toBe(2);
  });
  it("any trump beats the led suit; highest trump wins", () => {
    expect(trickWinner(trick(0, "AH", "2S", "KH", "7S").plays, "S", 40)).toBe(3);
  });
  it("uses the 52-deck ranking when asked", () => {
    expect(trickWinner(trick(0, "9H", "10H", "8H", "6H").plays, "S", 52)).toBe(1);
  });
});

describe("sit out", () => {
  const base = { score: 10, forcedPlayThreshold: 5, consecutiveSitOuts: 0, trump: "S" as const };
  it("allowed by default", () => {
    expect(canSitOut(base)).toBe(true);
  });
  it("blocked under the threshold", () => {
    expect(sitOutBlockedReason({ ...base, score: 4 })).toBe("belowThreshold");
    expect(sitOutBlockedReason({ ...base, score: 5 })).toBeNull();
  });
  it("blocked after two consecutive sit outs", () => {
    expect(sitOutBlockedReason({ ...base, consecutiveSitOuts: 2 })).toBe("maxConsecutive");
    expect(sitOutBlockedReason({ ...base, consecutiveSitOuts: 1 })).toBeNull();
  });
  it("blocked when clubs are trump", () => {
    expect(sitOutBlockedReason({ ...base, trump: "C" })).toBe("clubs");
  });
  it("blocked for whoever named the trump", () => {
    expect(sitOutBlockedReason({ ...base, isTrumpNamer: true })).toBe("trumpNamer");
  });
});
