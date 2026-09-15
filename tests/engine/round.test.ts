import { describe, expect, it } from "vitest";
import {
  type Action,
  type RoundContext,
  type RoundState,
  applyAction,
  autoPlay,
  chooseAction,
  createRound,
  inSeats,
  legalPlays,
  maxDiscard,
  redact,
  suitOf,
  viewFor,
  withdrawSeat,
} from "@/engine";

const ctx: RoundContext = { scores: [20, 20, 20, 20], sitOutStreak: [0, 0, 0, 0], forcedPlayThreshold: 5 };

function make(seed = 1, seatCount = 4, dealerSeat = 0): RoundState {
  return createRound({ deck: 40, seatCount, dealerSeat, maxDiscard: 5, blankPenalty: 5, seed: String(seed) });
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

describe("createRound", () => {
  it("deals 3 cards each, starting left of the dealer, and asks that player for trump", () => {
    const s = make(7, 4, 2);
    expect(s.phase).toBe("trump");
    expect(s.turnSeat).toBe(3);
    expect(s.hands.map((h) => h.length)).toEqual([3, 3, 3, 3]);
    expect(s.drawPile).toHaveLength(40 - 12);
    const all = [...s.hands.flat(), ...s.drawPile];
    expect(new Set(all).size).toBe(40);
  });

  it("is deterministic for a seed", () => {
    expect(make(42)).toEqual(make(42));
    expect(make(42).hands).not.toEqual(make(43).hands);
  });
});

describe("trump + deal 2", () => {
  it("only the player left of the dealer may name trump", () => {
    const s = make();
    expectError(s, { type: "nameTrump", seat: 2, suit: "H" }, "notYourTurn");
    expectError(s, { type: "play", seat: 1, card: "AH" }, "wrongPhase");
    const next = step(s, { type: "nameTrump", seat: 1, suit: "H" });
    expect(next.trump).toBe("H");
    expect(next.phase).toBe("discard");
    expect(next.turnSeat).toBe(1);
    expect(next.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(next.drawPile).toHaveLength(20);
    // input untouched
    expect(s.phase).toBe("trump");
  });
});

describe("hearts in the dark", () => {
  it("quadruples the round for a seat with at least four blank penalties in points", () => {
    const next = step(make(), { type: "darkHearts", seat: 1 });
    expect(next.trump).toBe("H");
    expect(next.darkHearts).toBe(true);
  });

  it("is refused below four blank penalties", () => {
    expectError(make(), { type: "darkHearts", seat: 1 }, "darkHeartsTooFewPoints", { ...ctx, scores: [20, 19, 20, 20] });
  });
});

describe("flipping for the trump", () => {
  it("the next card off the stock sets the trump and still reaches the flipper", () => {
    const s = make();
    const next = s.drawPile[s.drawPile.length - 1]!;
    const after = step(s, { type: "flipTrump", seat: 1 });
    expect(after.trump).toBe(suitOf(next));
    expect(after.flipped).toBe(next);
    expect(after.trumpSeat).toBe(1);
    expect(after.hands[1]).toContain(next);
    expect(after.hands.map((h) => h.length)).toEqual([5, 5, 5, 5]);
    expect(after.phase).toBe("discard");
    expect(after.turnSeat).toBe(1);
    // input untouched
    expect(s.phase).toBe("trump");
    expect(s.flipped).toBeNull();
  });

  it("frees the flipper to sit the round out, unlike naming a suit", () => {
    const flipped = step(make(), { type: "flipTrump", seat: 1 });
    if (flipped.trump === "C") {
      // Clubs stop everybody, flipper included; that rule is tested on its own.
      expect(applyAction(flipped, { type: "sitOut", seat: 1 }, ctx).ok).toBe(false);
      return;
    }
    const out = step(flipped, { type: "sitOut", seat: 1 });
    expect(out.seats[1]!.decision).toBe("out");
    expect(out.turnSeat).toBe(2);
  });

  it("only the seat on turn may flip, and only during the trump phase", () => {
    const s = make();
    expectError(s, { type: "flipTrump", seat: 2 }, "notYourTurn");
    const after = step(s, { type: "flipTrump", seat: 1 });
    expectError(after, { type: "flipTrump", seat: 1 }, "wrongPhase");
  });
});

describe("discard phase", () => {
  const start = () => step(make(), { type: "nameTrump", seat: 1, suit: "S" });

  it("discards, draws replacements and moves the turn clockwise", () => {
    const s = start();
    const toss = s.hands[1]!.slice(0, 2);
    const next = step(s, { type: "discard", seat: 1, cards: toss });
    expect(next.hands[1]).toHaveLength(5);
    for (const c of toss) expect(next.hands[1]).not.toContain(c);
    expect(next.drawPile).toHaveLength(18);
    expect(next.seats[1]).toMatchObject({ decision: "in", discardCount: 2 });
    expect(next.turnSeat).toBe(2);
  });

  it("enforces the cap, ownership and uniqueness", () => {
    const s = { ...start(), maxDiscard: 1 };
    const [a, b] = s.hands[1]!;
    expectError(s, { type: "discard", seat: 1, cards: [a!, b!] }, "tooManyDiscards");
    expectError(s, { type: "discard", seat: 1, cards: [s.hands[2]![0]!] }, "cardNotInHand");
    expectError({ ...s, maxDiscard: 5 }, { type: "discard", seat: 1, cards: [a!, a!] }, "duplicateCards");
    expectError(s, { type: "discard", seat: 2, cards: [] }, "notYourTurn");
  });

  it("the seat that named the trump is committed to the round", () => {
    expectError(start(), { type: "sitOut", seat: 1 }, "sitOutTrumpNamer");
  });

  it("sit out rules", () => {
    // Seat 1 named the trump, so the rules below are exercised on the next seat along.
    const s = step(start(), { type: "discard", seat: 1, cards: [] });
    expectError(s, { type: "sitOut", seat: 2 }, "sitOutBelowThreshold", { ...ctx, scores: [20, 20, 4, 20] });
    expectError(s, { type: "sitOut", seat: 2 }, "sitOutMaxConsecutive", { ...ctx, sitOutStreak: [0, 0, 2, 0] });
    const clubs = step(step(make(), { type: "nameTrump", seat: 1, suit: "C" }), { type: "discard", seat: 1, cards: [] });
    expectError(clubs, { type: "sitOut", seat: 2 }, "sitOutClubs");
    const out = step(s, { type: "sitOut", seat: 2 });
    expect(out.seats[2]!.decision).toBe("out");
    expect(out.turnSeat).toBe(3);
    expectError(out, { type: "discard", seat: 2, cards: [] }, "notYourTurn");
  });

  it("after everyone decides, the first player in leads", () => {
    let s = start();
    s = step(s, { type: "discard", seat: 1, cards: [] });
    s = step(s, { type: "sitOut", seat: 2 });
    s = step(s, { type: "discard", seat: 3, cards: [] });
    s = step(s, { type: "discard", seat: 0, cards: [] });
    expect(s.phase).toBe("tricks");
    expect(s.turnSeat).toBe(1);
    expect(s.currentTrick.leader).toBe(1);
    expect(inSeats(s)).toEqual([1, 3, 0]);
  });

  it("a lone player takes all five tricks", () => {
    let s = start();
    s = step(s, { type: "discard", seat: 1, cards: [] });
    for (const seat of [2, 3, 0]) s = step(s, { type: "sitOut", seat });
    expect(s.phase).toBe("scored");
    expect(s.seats[1]!.tricksWon).toBe(5);
    expect(s.deltas).toEqual([0, -5, 0, 0]);
  });
});

/** Play a whole round with bots and return the final state. */
function playOut(seed: number, seatCount = 4, deck: 40 | 52 = 40): RoundState {
  let s = createRound({ deck, seatCount, dealerSeat: 0, maxDiscard: maxDiscard(deck, seatCount), blankPenalty: 5, seed: String(seed) });
  const c: RoundContext = {
    scores: Array(seatCount).fill(20),
    sitOutStreak: Array(seatCount).fill(0),
    forcedPlayThreshold: 5,
  };
  let guard = 0;
  while (s.phase !== "scored") {
    if (guard++ > 200) throw new Error("round did not terminate");
    s = step(s, chooseAction(s, s.turnSeat!, c), c);
  }
  return s;
}

describe("full rounds", () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])("seed %i terminates with 5 tricks or a short-circuit", (seed) => {
    const s = playOut(seed);
    expect(s.phase).toBe("scored");
    const players = inSeats(s);
    if (players.length >= 2) {
      expect(s.completedTricks).toHaveLength(5);
      const total = s.seats.reduce((n, x) => n + x.tricksWon, 0);
      expect(total).toBe(5);
      for (const t of s.completedTricks) expect(t.plays).toHaveLength(players.length);
    }
    const deltas = s.deltas!;
    for (const seat of players) {
      const won = s.seats[seat]!.tricksWon;
      const mult = s.trump === "H" ? 2 : 1;
      expect(deltas[seat]).toBe(won === 0 ? 5 * mult : -won * mult);
    }
    for (let seat = 0; seat < 4; seat++) if (!players.includes(seat)) expect(deltas[seat]).toBe(0);
  });

  it("works with 8 seats on the 52 deck", () => {
    const s = playOut(11, 8, 52);
    expect(s.phase).toBe("scored");
  });

  it("every played card was legal at the time and the winner led the next trick", () => {
    let s = make(99);

    s = step(s, { type: "nameTrump", seat: 1, suit: "D" });
    for (const seat of [1, 2, 3, 0]) s = step(s, { type: "discard", seat, cards: [] });
    while (s.phase === "tricks") {
      const seat = s.turnSeat!;
      const action = autoPlay(s, seat);
      if (action.type !== "play") throw new Error("expected play");
      expect(legalPlays(s.hands[seat]!, s.currentTrick, s.trump!, s.deck)).toContain(action.card);
      // an illegal card must be rejected
      const illegal = s.hands[seat]!.find(
        (card) => !legalPlays(s.hands[seat]!, s.currentTrick, s.trump!, s.deck).includes(card),
      );
      if (illegal) expectError(s, { type: "play", seat, card: illegal }, "illegalPlay");
      const before = s.completedTricks.length;
      s = step(s, action);
      if (s.completedTricks.length > before && s.phase === "tricks") {
        expect(s.turnSeat).toBe(s.completedTricks.at(-1)!.winner);
      }
    }
    expect(s.completedTricks).toHaveLength(5);
  });
});

describe("redaction", () => {
  it("never exposes hands or the draw pile", () => {
    const s = make();
    const pub = redact(s) as unknown as Record<string, unknown>;
    expect(pub).not.toHaveProperty("hands");
    expect(pub).not.toHaveProperty("drawPile");
    expect(pub.handSizes).toEqual([3, 3, 3, 3]);
    const view = viewFor(s, 2);
    expect(view.hand).toEqual(s.hands[2]);
    expect(view).not.toHaveProperty("hands");
  });
});

describe("withdrawSeat", () => {
  it("passes the trump choice on and keeps the deal", () => {
    const s = make(11, 4, 0);
    expect(s.turnSeat).toBe(1);
    const stock = s.drawPile.length;
    const gone = withdrawSeat(s, 1);

    expect(gone.phase).toBe("trump");
    expect(gone.turnSeat).toBe(2);
    expect(gone.seats[1]!.decision).toBe("out");
    expect(gone.hands[1]).toEqual([]);
    // Their three cards go back under the stock, where nobody draws them next.
    expect(gone.drawPile).toHaveLength(stock + 3);
    expect(gone.drawPile.slice(3)).toEqual(s.drawPile);
    expect(s.seats[1]!.decision).toBe("pending"); // the input is untouched
  });

  it("is not dealt into when the rest of the hands go out", () => {
    const s = withdrawSeat(make(12, 4, 0), 1);
    const dealt = step(s, { type: "nameTrump", seat: 2, suit: "S" });
    expect(dealt.phase).toBe("discard");
    expect(dealt.hands[1]).toEqual([]);
    expect(dealt.hands.filter((_, seat) => seat !== 1).every((h) => h.length === 5)).toBe(true);
    // The seat is skipped over rather than asked to decide.
    expect(dealt.turnSeat).toBe(2);
  });

  it("hands the decision along mid-discard, and scores the round when it was the last one", () => {
    let s = step(make(13, 4, 0), { type: "nameTrump", seat: 1, suit: "S" });
    s = step(s, { type: "discard", seat: 1, cards: [] });
    s = step(s, { type: "sitOut", seat: 2 });
    expect(s.turnSeat).toBe(3);

    const midway = withdrawSeat(s, 3);
    expect(midway.turnSeat).toBe(0);
    expect(midway.seats[3]!.decision).toBe("out");

    // Only seat 1 is left in: it takes every trick and the round is over.
    const done = withdrawSeat(step(midway, { type: "sitOut", seat: 0 }), 0);
    expect(done.phase).toBe("scored");
    expect(done.seats[1]!.tricksWon).toBe(5);
  });

  it("leaves a seat that is already committed to the round alone", () => {
    let s = step(make(14, 4, 0), { type: "nameTrump", seat: 1, suit: "S" });
    s = step(s, { type: "discard", seat: 1, cards: [] });
    expect(withdrawSeat(s, 1)).toBe(s);
    expect(withdrawSeat(s, 9)).toBe(s);
  });
});
