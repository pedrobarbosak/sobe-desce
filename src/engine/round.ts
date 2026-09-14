import { type Card, type DeckSize, type Suit, SUITS, buildDeck, isCard, suitOf } from "./cards";
import { HAND_SIZE, TRICKS_PER_ROUND } from "./config";
import { EngineError } from "./errors";
import { legalPlays, sitOutBlockedReason } from "./legal";
import { rngFromSeed, shuffle } from "./rng";
import { canCallDarkHearts, roundDeltas } from "./scoring";
import { type CompletedTrick, type TrickInProgress, trickWinner } from "./trick";

export type Phase = "trump" | "discard" | "tricks" | "scored";
export type Decision = "pending" | "in" | "out";

export type SeatState = {
  decision: Decision;
  discardCount: number;
  tricksWon: number;
};

export type RoundState = {
  deck: DeckSize;
  seatCount: number;
  dealerSeat: number;
  maxDiscard: number;
  blankPenalty: number;
  phase: Phase;
  trump: Suit | null;
  /** Seat that settled the trump, by naming it or by flipping for it. */
  trumpSeat: number | null;
  /**
   * The card whose suit became the trump, when that seat flipped instead of choosing.
   * Public: everyone sees it, and it still goes into the flipper's hand.
   */
  flipped: Card | null;
  /** Hearts called before the caller had seen a single card: everything counts fourfold. */
  darkHearts: boolean;
  /** Seat expected to act; null once the round is scored. */
  turnSeat: number | null;
  seats: SeatState[];
  /** PRIVATE: one hand per seat. Never send to clients as a whole. */
  hands: Card[][];
  /** PRIVATE: remaining stock. */
  drawPile: Card[];
  currentTrick: TrickInProgress;
  completedTricks: CompletedTrick[];
  /** Set when phase === "scored". Indexed by seat. */
  deltas: number[] | null;
};

/** Per-seat context the round needs from the outside world (scores live on the game). */
export type RoundContext = {
  scores: readonly number[];
  sitOutStreak: readonly number[];
  forcedPlayThreshold: number;
};

export type Action =
  | { type: "nameTrump"; seat: number; suit: Suit }
  | { type: "flipTrump"; seat: number }
  | { type: "darkHearts"; seat: number }
  | { type: "discard"; seat: number; cards: Card[] }
  | { type: "sitOut"; seat: number }
  | { type: "play"; seat: number; card: Card };

export type RoundEvent =
  | { type: "trumpNamed"; seat: number; suit: Suit }
  | { type: "trumpFlipped"; seat: number; suit: Suit; card: Card }
  | { type: "darkHeartsCalled"; seat: number }
  | { type: "dealt"; count: number }
  | { type: "discarded"; seat: number; count: number }
  | { type: "satOut"; seat: number }
  | { type: "played"; seat: number; card: Card }
  | { type: "trickWon"; seat: number; trickIndex: number }
  | { type: "scored"; deltas: number[] };

export type ApplyResult =
  | { ok: true; state: RoundState; events: RoundEvent[] }
  | { ok: false; error: EngineError };

export type CreateRoundInput = {
  deck: DeckSize;
  seatCount: number;
  dealerSeat: number;
  maxDiscard: number;
  blankPenalty: number;
  seed: string;
};

export function leftOf(seat: number, seatCount: number): number {
  return (seat + 1) % seatCount;
}

/** Seats in clockwise order starting at the dealer's left. */
export function playOrder(dealerSeat: number, seatCount: number): number[] {
  const out: number[] = [];
  for (let i = 1; i <= seatCount; i++) out.push((dealerSeat + i) % seatCount);
  return out;
}

function dealCards(state: RoundState, perPlayer: number): void {
  for (const seat of playOrder(state.dealerSeat, state.seatCount)) {
    for (let i = 0; i < perPlayer; i++) {
      const card = state.drawPile.pop();
      if (!card) throw new Error("Stock ran dry while dealing");
      state.hands[seat]!.push(card);
    }
  }
}

/** Shuffle with the seed and deal the first three cards to everyone. */
export function createRound(input: CreateRoundInput): RoundState {
  const rng = rngFromSeed(input.seed);
  const state: RoundState = {
    deck: input.deck,
    seatCount: input.seatCount,
    dealerSeat: input.dealerSeat,
    maxDiscard: input.maxDiscard,
    blankPenalty: input.blankPenalty,
    phase: "trump",
    trump: null,
    trumpSeat: null,
    flipped: null,
    darkHearts: false,
    turnSeat: leftOf(input.dealerSeat, input.seatCount),
    seats: Array.from({ length: input.seatCount }, () => ({
      decision: "pending",
      discardCount: 0,
      tricksWon: 0,
    })),
    hands: Array.from({ length: input.seatCount }, () => []),
    drawPile: shuffle(buildDeck(input.deck), rng),
    currentTrick: { leader: leftOf(input.dealerSeat, input.seatCount), plays: [] },
    completedTricks: [],
    deltas: null,
  };
  dealCards(state, 3);
  return state;
}

function clone(state: RoundState): RoundState {
  return {
    ...state,
    seats: state.seats.map((s) => ({ ...s })),
    hands: state.hands.map((h) => [...h]),
    drawPile: [...state.drawPile],
    currentTrick: { ...state.currentTrick, plays: [...state.currentTrick.plays] },
    completedTricks: state.completedTricks.map((t) => ({ ...t, plays: [...t.plays] })),
    deltas: state.deltas ? [...state.deltas] : null,
  };
}

export function inSeats(state: RoundState): number[] {
  return playOrder(state.dealerSeat, state.seatCount).filter(
    (s) => state.seats[s]!.decision === "in",
  );
}

function nextInSeat(state: RoundState, from: number): number {
  for (let i = 1; i <= state.seatCount; i++) {
    const s = (from + i) % state.seatCount;
    if (state.seats[s]!.decision === "in") return s;
  }
  throw new Error("No seats in the round");
}

function scoreRound(state: RoundState, events: RoundEvent[]): void {
  const deltas = roundDeltas(
    state.seats.map((s, seat) => ({
      seat,
      participated: s.decision === "in",
      tricksWon: s.tricksWon,
    })),
    state.trump!,
    state.blankPenalty,
    state.darkHearts,
  );
  state.deltas = state.seats.map((_, seat) => deltas.get(seat) ?? 0);
  state.phase = "scored";
  state.turnSeat = null;
  events.push({ type: "scored", deltas: state.deltas });
}

function finishDiscardPhase(state: RoundState, events: RoundEvent[]): void {
  const players = inSeats(state);
  if (players.length === 0) {
    scoreRound(state, events);
    return;
  }
  if (players.length === 1) {
    // Nobody to play against: the lone player takes every trick.
    state.seats[players[0]!]!.tricksWon = TRICKS_PER_ROUND;
    scoreRound(state, events);
    return;
  }
  state.phase = "tricks";
  const leader = players[0]!;
  state.currentTrick = { leader, plays: [] };
  state.turnSeat = leader;
}

function advanceDiscardTurn(state: RoundState, events: RoundEvent[]): void {
  const pending = playOrder(state.dealerSeat, state.seatCount).find(
    (s) => state.seats[s]!.decision === "pending",
  );
  if (pending === undefined) {
    finishDiscardPhase(state, events);
  } else {
    state.turnSeat = pending;
  }
}

/** Deal everyone up to a full hand and hand the turn to the first decider. */
function finishTrumpPhase(state: RoundState, events: RoundEvent[]): void {
  dealCards(state, HAND_SIZE - 3);
  events.push({ type: "dealt", count: HAND_SIZE - 3 });
  state.phase = "discard";
  state.turnSeat = leftOf(state.dealerSeat, state.seatCount);
}

function fail(code: EngineError["code"], message?: string): ApplyResult {
  return { ok: false, error: new EngineError(code, message) };
}

/**
 * Pure reducer. Never mutates the input; returns the next state or an error.
 */
export function applyAction(
  prev: RoundState,
  action: Action,
  ctx: RoundContext,
): ApplyResult {
  if (action.seat < 0 || action.seat >= prev.seatCount || !Number.isInteger(action.seat)) {
    return fail("invalidSeat");
  }
  if (prev.turnSeat !== action.seat) return fail("notYourTurn");
  const state = clone(prev);
  const events: RoundEvent[] = [];
  const seatState = state.seats[action.seat]!;
  const hand = state.hands[action.seat]!;

  switch (action.type) {
    case "nameTrump": {
      if (state.phase !== "trump") return fail("wrongPhase");
      if (!SUITS.includes(action.suit)) return fail("invalidSuit");
      state.trump = action.suit;
      state.trumpSeat = action.seat;
      events.push({ type: "trumpNamed", seat: action.seat, suit: action.suit });
      finishTrumpPhase(state, events);
      return { ok: true, state, events };
    }

    /**
     * Hearts, called blind. The caller has not seen a card, so the round pays four times
     * over in both directions. Everything after this is an ordinary hearts round.
     */
    case "darkHearts": {
      if (state.phase !== "trump") return fail("wrongPhase");
      if (!canCallDarkHearts(ctx.scores[action.seat] ?? 0, state.blankPenalty)) {
        return fail("darkHeartsTooFewPoints");
      }
      state.trump = "H";
      state.trumpSeat = action.seat;
      state.darkHearts = true;
      events.push({ type: "darkHeartsCalled", seat: action.seat });
      finishTrumpPhase(state, events);
      return { ok: true, state, events };
    }

    /**
     * Undecided? Let the deck choose. The next card off the stock sets the trump and is
     * then dealt to the flipper like any other card, so everybody sees one of their cards.
     * The trade is that a flipper is not committed and may still sit the round out.
     */
    case "flipTrump": {
      if (state.phase !== "trump") return fail("wrongPhase");
      const card = state.drawPile[state.drawPile.length - 1];
      if (!card) return fail("stockEmpty");
      state.trump = suitOf(card);
      state.trumpSeat = action.seat;
      state.flipped = card;
      events.push({ type: "trumpFlipped", seat: action.seat, suit: state.trump, card });
      finishTrumpPhase(state, events);
      return { ok: true, state, events };
    }

    case "discard": {
      if (state.phase !== "discard") return fail("wrongPhase");
      if (seatState.decision !== "pending") return fail("alreadyDecided");
      if (action.cards.length > state.maxDiscard) return fail("tooManyDiscards");
      if (new Set(action.cards).size !== action.cards.length) return fail("duplicateCards");
      for (const card of action.cards) {
        if (!isCard(card, state.deck) || !hand.includes(card)) {
          return fail("cardNotInHand", String(card));
        }
      }
      if (action.cards.length > state.drawPile.length) {
        // Cannot happen with a valid discard cap, but never let the stock go negative.
        return fail("tooManyDiscards", "stock exhausted");
      }
      const kept = hand.filter((c) => !action.cards.includes(c));
      for (let i = 0; i < action.cards.length; i++) kept.push(state.drawPile.pop()!);
      state.hands[action.seat] = kept;
      seatState.decision = "in";
      seatState.discardCount = action.cards.length;
      events.push({ type: "discarded", seat: action.seat, count: action.cards.length });
      advanceDiscardTurn(state, events);
      return { ok: true, state, events };
    }

    case "sitOut": {
      if (state.phase !== "discard") return fail("wrongPhase");
      if (seatState.decision !== "pending") return fail("alreadyDecided");
      const blocked = sitOutBlockedReason({
        score: ctx.scores[action.seat] ?? 0,
        forcedPlayThreshold: ctx.forcedPlayThreshold,
        consecutiveSitOuts: ctx.sitOutStreak[action.seat] ?? 0,
        trump: state.trump!,
        isTrumpNamer: state.trumpSeat === action.seat && state.flipped === null,
      });
      if (blocked === "trumpNamer") return fail("sitOutTrumpNamer");
      if (blocked === "clubs") return fail("sitOutClubs");
      if (blocked === "belowThreshold") return fail("sitOutBelowThreshold");
      if (blocked === "maxConsecutive") return fail("sitOutMaxConsecutive");
      seatState.decision = "out";
      events.push({ type: "satOut", seat: action.seat });
      advanceDiscardTurn(state, events);
      return { ok: true, state, events };
    }

    case "play": {
      if (state.phase !== "tricks") return fail("wrongPhase");
      if (!isCard(action.card, state.deck) || !hand.includes(action.card)) {
        return fail("cardNotInHand", String(action.card));
      }
      const legal = legalPlays(hand, state.currentTrick, state.trump!, state.deck);
      if (!legal.includes(action.card)) return fail("illegalPlay");
      state.hands[action.seat] = hand.filter((c) => c !== action.card);
      state.currentTrick.plays.push({ seat: action.seat, card: action.card });
      events.push({ type: "played", seat: action.seat, card: action.card });

      const players = inSeats(state);
      if (state.currentTrick.plays.length < players.length) {
        state.turnSeat = nextInSeat(state, action.seat);
        return { ok: true, state, events };
      }

      const winner = trickWinner(state.currentTrick.plays, state.trump!, state.deck);
      state.seats[winner]!.tricksWon += 1;
      state.completedTricks.push({ ...state.currentTrick, winner });
      events.push({ type: "trickWon", seat: winner, trickIndex: state.completedTricks.length - 1 });
      if (state.completedTricks.length >= TRICKS_PER_ROUND) {
        scoreRound(state, events);
      } else {
        state.currentTrick = { leader: winner, plays: [] };
        state.turnSeat = winner;
      }
      return { ok: true, state, events };
    }
  }
}
