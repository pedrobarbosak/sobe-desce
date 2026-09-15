import { describe, expect, it } from "vitest";
import {
  type Action,
  type PartyState,
  type RoundContext,
  type RoundState,
  type Twist,
  CLASSIC_RULES,
  LIGHTNING_SECONDS,
  POWERUPS_ENABLED,
  TWISTS,
  applyAction,
  autoPlay,
  awardPowerups,
  chooseAction,
  choosePowerup,
  createRound,
  legalPlays,
  partyDeltas,
  redact,
  rngFromSeed,
  rulesFor,
  viewFor,
} from "@/engine";

const ctx: RoundContext = { scores: [20, 20, 20, 20], sitOutStreak: [0, 0, 0, 0], forcedPlayThreshold: 5 };

function make(seed: string | number = 1, inventory: PartyState["inventory"] = []): RoundState {
  return createRound({ deck: 40, seatCount: 4, dealerSeat: 0, maxDiscard: 5, blankPenalty: 5, seed: String(seed), variant: "party", inventory });
}

/** The first seed whose round carries the twist, so each test pins its own weather. */
function seedFor(twist: Twist): string {
  for (let i = 0; i < 500; i++) if (make(i).party!.twist === twist) return String(i);
  throw new Error(`no seed draws ${twist}`);
}

function step(state: RoundState, action: Action, c: RoundContext = ctx): RoundState {
  const r = applyAction(state, action, c);
  if (!r.ok) throw r.error;
  return r.state;
}

function expectError(state: RoundState, action: Action, code: string, c: RoundContext = ctx) {
  const r = applyAction(state, action, c);
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.error.code).toBe(code);
}

/** Trump named, everybody in with no discards: the round is ready for its tricks. */
function inTricks(state: RoundState, suit: "H" | "D" | "C" | "S" = "S"): RoundState {
  let s = step(state, { type: "nameTrump", seat: 1, suit });
  for (const seat of [1, 2, 3, 0]) s = step(s, { type: "discard", seat, cards: [] });
  expect(s.phase).toBe("tricks");
  return s;
}

function party(over: Partial<PartyState> = {}): PartyState {
  return {
    twist: "golden",
    goldenSuit: null,
    inventory: [[], [], [], []],
    shielded: [false, false, false, false],
    curses: [0, 0, 0, 0],
    peeks: [],
    passes: [null, null, null, null],
    ...over,
  };
}

const allIn = (tricks: number[]) => tricks.map((tricksWon) => ({ decision: "in" as const, tricksWon }));

describe("party rounds", () => {
  it("only a party round carries a twist, and every twist is reachable", () => {
    const classic = createRound({ deck: 40, seatCount: 4, dealerSeat: 0, maxDiscard: 5, blankPenalty: 5, seed: "1" });
    expect(classic.party).toBeNull();
    expect(rulesFor(classic)).toEqual(CLASSIC_RULES);
    for (const twist of TWISTS) expect(make(seedFor(twist)).party!.twist).toBe(twist);
  });

  it("deals the same cards as a classic round from the same seed", () => {
    const classic = createRound({ deck: 40, seatCount: 4, dealerSeat: 0, maxDiscard: 5, blankPenalty: 5, seed: "9" });
    expect(make("9").hands).toEqual(classic.hands);
    expect(make("9")).toEqual(make("9"));
  });

  it("the golden suit is never hearts", () => {
    for (let i = 0; i < 200; i++) {
      const p = make(i).party!;
      if (p.twist === "golden") expect(p.goldenSuit).not.toBe("H");
      else expect(p.goldenSuit).toBeNull();
    }
  });
});

describe("desce: the low card wins", () => {
  it("the lowest trump must lead, following goes under, and the lowest card takes the trick", () => {
    let s = inTricks(make(seedFor("desce")));
    expect(rulesFor(s).lowWins).toBe(true);
    s.hands = [
      ["5S", "AH", "KD", "QC", "6H"],
      ["2S", "7H", "3H", "4D", "JC"],
      ["AS", "QH", "5H", "6D", "KC"],
      ["3S", "4H", "2H", "7D", "AC"],
    ];
    // The 2 of trumps is the unbeatable card now, so it leads.
    expect(legalPlays(s.hands[1]!, s.currentTrick, "S", 40, rulesFor(s))).toEqual(["2S"]);
    s = step(s, { type: "play", seat: 1, card: "2S" });
    // Seat 2 holds the AS: it cannot go under a 2, so it is free to play any spade.
    expect(legalPlays(s.hands[2]!, s.currentTrick, "S", 40, rulesFor(s))).toEqual(["AS"]);
    s = step(s, { type: "play", seat: 2, card: "AS" });
    s = step(s, { type: "play", seat: 3, card: "3S" });
    s = step(s, { type: "play", seat: 0, card: "5S" });
    expect(s.completedTricks[0]!.winner).toBe(1);
    expect(s.turnSeat).toBe(1);

    // Following suit: seat 1 leads 7H; seat 2 must go under with a heart if it can. In the
    // 40-card order (A 7 K J Q 6 5 4 3 2) the Queen sits below the 7, so both hearts qualify.
    s = step(s, { type: "play", seat: 1, card: "7H" });
    expect(legalPlays(s.hands[2]!, s.currentTrick, "S", 40, rulesFor(s))).toEqual(["QH", "5H"]);
    s = step(s, { type: "play", seat: 2, card: "5H" });
    s = step(s, { type: "play", seat: 3, card: "4H" });
    s = step(s, { type: "play", seat: 0, card: "6H" });
    expect(s.completedTricks[1]!.winner).toBe(3);
  });

  it("the timer and the bots read strength the other way round", () => {
    const s = inTricks(make(seedFor("desce")));
    s.hands[1] = ["AH", "3H", "KD", "QC", "6D"];
    // Least committal on a timeout is the card least likely to win: the high one.
    expect(autoPlay(s, 1)).toEqual({ type: "play", seat: 1, card: "AH" });
    // Leading, the bot puts out its strongest non-trump, which is its lowest.
    expect(chooseAction(s, 1, ctx)).toEqual({ type: "play", seat: 1, card: "3H" });
  });
});

describe("no trump", () => {
  it("skips the trump phase, deals five, and lets only the led suit win", () => {
    const fresh = make(seedFor("noTrump"));
    expect(fresh.phase).toBe("discard");
    expect(fresh.trump).toBeNull();
    expect(fresh.trumpSeat).toBeNull();
    expect(fresh.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(fresh.turnSeat).toBe(1);
    expectError(fresh, { type: "nameTrump", seat: 1, suit: "S" }, "wrongPhase");
    let s = fresh;
    for (const seat of [1, 2, 3, 0]) s = step(s, { type: "discard", seat, cards: [] });
    s.hands = [
      ["5S", "AH", "KD", "QC", "6H"],
      ["2S", "7H", "3H", "4D", "JC"],
      ["AS", "QH", "5H", "6D", "KC"],
      ["3S", "4H", "2H", "AC", "KC"],
    ];
    // No ace-of-trumps lead rule: anything goes.
    expect(legalPlays(s.hands[1]!, s.currentTrick, s.trump, 40, rulesFor(s))).toHaveLength(5);
    s = step(s, { type: "play", seat: 1, card: "4D" });
    expect(legalPlays(s.hands[2]!, s.currentTrick, s.trump, 40, rulesFor(s))).toEqual(["6D"]);
    s = step(s, { type: "play", seat: 2, card: "6D" });
    // Void in diamonds: nothing can trump, so any card is fine and none of them wins.
    expect(legalPlays(s.hands[3]!, s.currentTrick, s.trump, 40, rulesFor(s))).toHaveLength(5);
    s = step(s, { type: "play", seat: 3, card: "AC" });
    s = step(s, { type: "play", seat: 0, card: "KD" });
    expect(s.completedTricks[0]!.winner).toBe(0);
    expect(chooseAction(s, 0, ctx).type).toBe("play");
  });
});

describe("pass left", () => {
  it("adds a pass phase after the discards and delivers every card one seat clockwise", () => {
    const fresh = make(seedFor("passLeft"));
    let s = step(fresh, { type: "nameTrump", seat: 1, suit: "S" });
    for (const seat of [1, 2, 3]) s = step(s, { type: "discard", seat, cards: [] });
    s = step(s, { type: "sitOut", seat: 0 });
    expect(s.phase).toBe("pass");
    expect(s.turnSeat).toBe(1);
    expectError(s, { type: "play", seat: 1, card: s.hands[1]![0]! }, "wrongPhase");
    expectError(s, { type: "pass", seat: 2, card: s.hands[2]![0]! }, "notYourTurn");
    const given = [s.hands[1]![0]!, s.hands[2]![0]!, s.hands[3]![0]!];
    s = step(s, { type: "pass", seat: 1, card: given[0]! });
    expect(s.hands[1]).toHaveLength(4);
    expect(redact(s).party!.passed).toEqual([false, true, false, false]);
    expect(redact(s).party).not.toHaveProperty("passes");
    expect(s.turnSeat).toBe(2);
    s = step(s, { type: "pass", seat: 2, card: given[1]! });
    s = step(s, { type: "pass", seat: 3, card: given[2]! });
    // Seat 0 sat out, so seat 3's card skips it and lands with seat 1.
    expect(s.phase).toBe("tricks");
    expect(s.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(s.hands[2]).toContain(given[0]);
    expect(s.hands[3]).toContain(given[1]);
    expect(s.hands[1]).toContain(given[2]);
    expect(s.party!.passes).toEqual([null, null, null, null]);
    expect(s.turnSeat).toBe(1);
  });

  it("the timer passes the weakest card and bots pass their worst non-trump", () => {
    const fresh = make(seedFor("passLeft"));
    let s = step(fresh, { type: "nameTrump", seat: 1, suit: "S" });
    for (const seat of [1, 2, 3, 0]) s = step(s, { type: "discard", seat, cards: [] });
    s.hands[1] = ["2S", "AH", "3D", "KC", "7H"];
    expect(autoPlay(s, 1)).toEqual({ type: "pass", seat: 1, card: "2S" });
    expect(chooseAction(s, 1, ctx)).toEqual({ type: "pass", seat: 1, card: "3D" });
  });
});

describe("all in, as dealt, lightning, open hands", () => {
  it("all in: nobody may sit out", () => {
    let s = step(make(seedFor("allIn")), { type: "flipTrump", seat: 1 });
    expectError(s, { type: "sitOut", seat: 1 }, "sitOutAllIn");
    s = step(s, { type: "discard", seat: 1, cards: [] });
    expect(chooseAction(s, 2, ctx).type).toBe("discard");
  });

  it("as dealt: the cap is zero and nobody may sit out", () => {
    const fresh = make(seedFor("asDealt"));
    expect(fresh.maxDiscard).toBe(0);
    const s = step(fresh, { type: "flipTrump", seat: 1 });
    expectError(s, { type: "discard", seat: 1, cards: [s.hands[1]![0]!] }, "tooManyDiscards");
    expectError(s, { type: "sitOut", seat: 1 }, "sitOutAllIn");
    expect(step(s, { type: "discard", seat: 1, cards: [] }).seats[1]!.decision).toBe("in");
  });

  it("lightning and open hands only answer the rules questions the server asks", () => {
    expect(rulesFor(make(seedFor("lightning")))).toEqual({ ...CLASSIC_RULES, turnSeconds: LIGHTNING_SECONDS });
    expect(rulesFor(make(seedFor("openHands")))).toEqual({ ...CLASSIC_RULES, openHands: true });
    expect(rulesFor(make(seedFor("golden")))).toEqual(CLASSIC_RULES);
  });

  it("powerups are switched off", () => {
    expect(POWERUPS_ENABLED).toBe(false);
  });
});

describe("party scoring", () => {
  const base = { completedTricks: [], trump: "S" as const, blankPenalty: 5, darkHearts: false };

  it("golden: the drawn suit doubles the round only when it is trump", () => {
    const p = party({ twist: "golden", goldenSuit: "S" });
    expect(partyDeltas({ ...base, party: p, seats: allIn([2, 3, 0, 0]) })).toEqual([-4, -6, 10, 10]);
    expect(partyDeltas({ ...base, party: p, trump: "D", seats: allIn([2, 3, 0, 0]) })).toEqual([-2, -3, 5, 5]);
  });

  it("last trick: the fifth trick is worth three", () => {
    const p = party({ twist: "lastTrick" });
    const fifth = { leader: 0, plays: [], winner: 2 };
    const tricks = [fifth, fifth, fifth, fifth, fifth];
    expect(partyDeltas({ ...base, party: p, completedTricks: tricks, seats: allIn([0, 0, 5, 0]) })).toEqual([5, 5, -7, 5]);
    // Four tricks in: no bonus yet.
    expect(partyDeltas({ ...base, party: p, completedTricks: tricks.slice(0, 4), seats: allIn([0, 0, 4, 0]) })).toEqual([5, 5, -4, 5]);
  });

  it("blank pays: winning nothing pays the penalty out, hearts and all", () => {
    const p = party({ twist: "blankPays" });
    expect(partyDeltas({ ...base, party: p, seats: allIn([5, 0, 0, 0]) })).toEqual([-5, -5, -5, -5]);
    expect(partyDeltas({ ...base, party: p, trump: "H", seats: allIn([5, 0, 0, 0]) })).toEqual([-10, -10, -10, -10]);
    // Sitting out still scores nothing.
    const seats = [...allIn([5, 0, 0]), { decision: "out" as const, tricksWon: 0 }];
    expect(partyDeltas({ ...base, party: p, seats })).toEqual([-5, -5, -5, 0]);
  });

  it("a shield cancels the blank, a curse adds two, and they stack with the twist", () => {
    const p = party({ twist: "golden", goldenSuit: "S", shielded: [false, false, true, false], curses: [1, 0, 0, 2] });
    expect(partyDeltas({ ...base, party: p, seats: allIn([2, 3, 0, 0]) })).toEqual([-2, -6, 0, 14]);
    // A cursed seat that sits the round out escapes it: sitting out changes nothing.
    const seats = [...allIn([2, 3, 0]), { decision: "out" as const, tricksWon: 0 }];
    expect(partyDeltas({ ...base, party: p, seats })).toEqual([-2, -6, 0, 0]);
  });
});

describe("powerups", () => {
  it("are spent out of turn, come off the stash, and are hidden from everyone else", () => {
    let s = inTricks(make(seedFor("golden"), [["peek", "shield"], [], ["curse"], []]));
    expect(s.turnSeat).toBe(1);
    s = step(s, { type: "usePowerup", seat: 0, powerup: "peek", target: 2 });
    expect(s.turnSeat).toBe(1);
    expect(s.party!.inventory[0]).toEqual(["shield"]);
    expect(s.party!.peeks).toEqual([{ seat: 0, target: 2 }]);

    const pub = redact(s);
    expect(pub.party).not.toHaveProperty("inventory");
    expect(pub.party!.inventorySizes).toEqual([1, 0, 1, 0]);
    expect(viewFor(s, 0).inventory).toEqual(["shield"]);
    expect(viewFor(s, 0).peeked).toEqual([{ seat: 2, cards: s.hands[2] }]);
    expect(viewFor(s, 2).peeked).toEqual([]);
    expect(viewFor(s, 2).inventory).toEqual(["curse"]);
  });

  it("refuses what the seat does not hold, the wrong phase, and bad targets", () => {
    const fresh = make(seedFor("golden"), [["peek", "shield", "curse"], [], [], []]);
    expectError(fresh, { type: "usePowerup", seat: 0, powerup: "shield" }, "powerupWrongPhase");
    expectError(fresh, { type: "usePowerup", seat: 1, powerup: "shield" }, "powerupNotHeld");
    let s = inTricks(fresh);
    expectError(s, { type: "usePowerup", seat: 0, powerup: "peek" }, "powerupBadTarget");
    expectError(s, { type: "usePowerup", seat: 0, powerup: "peek", target: 0 }, "powerupBadTarget");
    expectError(s, { type: "usePowerup", seat: 0, powerup: "curse", target: 4 }, "powerupBadTarget");
    expectError(s, { type: "usePowerup", seat: 0, powerup: "shield", target: 1 }, "powerupBadTarget");
    s = step(s, { type: "usePowerup", seat: 0, powerup: "shield" });
    expectError(s, { type: "usePowerup", seat: 0, powerup: "shield" }, "powerupNotHeld");
    s = step(s, { type: "usePowerup", seat: 0, powerup: "peek", target: 3 });
    expect(s.party!.inventory[0]).toEqual(["curse"]);
  });

  it("a seat that sat out cannot use or be targeted", () => {
    const fresh = make(seedFor("golden"), [["curse"], ["curse"], [], []]);
    let s = step(fresh, { type: "nameTrump", seat: 1, suit: "S" });
    s = step(s, { type: "discard", seat: 1, cards: [] });
    s = step(s, { type: "discard", seat: 2, cards: [] });
    s = step(s, { type: "discard", seat: 3, cards: [] });
    s = step(s, { type: "sitOut", seat: 0 });
    expectError(s, { type: "usePowerup", seat: 0, powerup: "curse", target: 1 }, "powerupSatOut");
    expectError(s, { type: "usePowerup", seat: 1, powerup: "curse", target: 0 }, "powerupBadTarget");
    s = step(s, { type: "usePowerup", seat: 1, powerup: "curse", target: 2 });
    expect(s.party!.curses).toEqual([0, 0, 1, 0]);
  });

  it("classic rounds have no powerups to spend", () => {
    const classic = createRound({ deck: 40, seatCount: 4, dealerSeat: 0, maxDiscard: 5, blankPenalty: 5, seed: "1" });
    expectError(classic, { type: "usePowerup", seat: 0, powerup: "shield" }, "notPartyTable");
  });

  it("catch-up: the seat furthest from zero and anyone who paid a blank draw one, up to the cap", () => {
    const rng = rngFromSeed("awards");
    const out = awardPowerups({
      scores: [18, 10, 25, 25],
      deltas: [5, -3, 0, 5],
      participated: [true, true, false, true],
      tricksWon: [0, 3, 0, 0],
      inventory: [[], ["peek"], ["peek", "curse"], []],
      rng,
    });
    // 0 blanked; 2 is furthest but full; 3 is furthest and blanked, yet draws only once.
    expect(out.awards.map((a) => a.seat)).toEqual([0, 3]);
    expect(out.inventory[0]).toHaveLength(1);
    expect(out.inventory[2]).toEqual(["peek", "curse"]);
    expect(out.inventory[3]).toHaveLength(1);
    expect(out.inventory[1]).toEqual(["peek"]);
  });

  it("bots shield a looming blank and curse the leader", () => {
    const s = inTricks(make(seedFor("golden"), [["shield"], ["curse"], [], []]));
    expect(choosePowerup(s, 0, ctx)).toBeNull(); // too early to know
    s.completedTricks = [1, 2, 3].map((w) => ({ leader: 1, plays: [], winner: w }));
    expect(choosePowerup(s, 0, ctx)).toEqual({ type: "usePowerup", seat: 0, powerup: "shield" });
    expect(choosePowerup(s, 1, { ...ctx, scores: [20, 20, 6, 15] })).toEqual({ type: "usePowerup", seat: 1, powerup: "curse", target: 2 });
    expect(choosePowerup(s, 2, ctx)).toBeNull();
  });
});
