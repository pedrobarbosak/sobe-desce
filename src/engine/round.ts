import { type Card, type DeckSize, type Suit, SUITS, buildDeck, isCard, suitOf } from "./cards";
import { DUMMY_SIZE, type Twist, passOffset } from "./party";
import { HAND_SIZE, TRICKS_PER_ROUND, type Variant } from "./config";
import { EngineError } from "./errors";
import { legalPlays, sitOutBlockedReason } from "./legal";
import {
  type PartyState,
  type Powerup,
  type PowerupAction,
  type PowerupEvent,
  applyPowerup,
  clonePartyState,
  createPartyState,
  partyDeltas,
  partyRules,
  powerupBlockedReason,
  robinHoodPair,
} from "./party";
import { rngFromSeed, shuffle } from "./rng";
import { CLASSIC_RULES, type RoundRules } from "./rules";
import { canCallDarkHearts, roundDeltas } from "./scoring";
import { type CompletedTrick, type TrickInProgress, trickWinner } from "./trick";

/**
 * `pass`, `market` and `dummy` only occur under party twists, between the discards and
 * the tricks: choosing cards to pass or lay out, taking from the market, swapping with
 * the spare hand.
 */
export type Phase = "vote" | "trump" | "discard" | "pass" | "market" | "dummy" | "tricks" | "scored";
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
  /** The round's twist and powerups. Null on a classic table. Holds PRIVATE inventories. */
  party: PartyState | null;
};

/** Per-seat context the round needs from the outside world (scores live on the game). */
export type RoundContext = {
  scores: readonly number[];
  sitOutStreak: readonly number[];
  forcedPlayThreshold: number;
};

export type Action =
  /** Party "voteTrump": this seat's vote for the trump. */
  | { type: "vote"; seat: number; suit: Suit }
  | { type: "nameTrump"; seat: number; suit: Suit }
  | { type: "flipTrump"; seat: number }
  | { type: "darkHearts"; seat: number }
  | { type: "discard"; seat: number; cards: Card[] }
  | { type: "sitOut"; seat: number }
  | { type: "play"; seat: number; card: Card }
  /** Party "pass" and "market": the cards this seat gives away or lays out. */
  | { type: "pass"; seat: number; cards: Card[] }
  /** Party "market": take one card back from the middle. */
  | { type: "take"; seat: number; card: Card }
  /** Party "dummy": swap one card with the spare hand, or pass with neither. */
  | { type: "dummy"; seat: number; give?: Card; take?: Card }
  | PowerupAction;

export type RoundEvent =
  | { type: "voted"; seat: number }
  | { type: "trumpVoted"; suit: Suit }
  | { type: "trumpNamed"; seat: number; suit: Suit }
  | { type: "trumpFlipped"; seat: number; suit: Suit; card: Card }
  | { type: "darkHeartsCalled"; seat: number }
  | { type: "dealt"; count: number }
  | { type: "discarded"; seat: number; count: number }
  | { type: "satOut"; seat: number }
  | { type: "passed"; seat: number }
  | { type: "took"; seat: number; card: Card }
  | { type: "dummySwapped"; seat: number; give: Card | null; take: Card | null }
  | { type: "played"; seat: number; card: Card }
  | { type: "trickWon"; seat: number; trickIndex: number }
  | { type: "scored"; deltas: number[] }
  | PowerupEvent;

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
  /** Defaults to classic. */
  variant?: Variant;
  /** Party only: what each seat brings to the round. */
  inventory?: readonly (readonly Powerup[])[];
  /** Party only: the twist of the round before, which this one will not repeat. */
  previousTwist?: Twist | null;
  /** Party only: the last few twists, none of which this round will repeat. */
  recentTwists?: readonly Twist[];
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

/** The rules this round plays by. Classic unless a party twist says otherwise. */
export function rulesFor(state: Pick<RoundState, "party">): RoundRules {
  return state.party ? partyRules(state.party) : CLASSIC_RULES;
}

function dealCards(state: RoundState, perPlayer: number): void {
  for (const seat of playOrder(state.dealerSeat, state.seatCount)) {
    // A seat that gave up on the round before the deal was finished is not dealt into:
    // its first three cards already went back under the stock. See withdrawSeat.
    if (state.seats[seat]!.decision === "out") continue;
    for (let i = 0; i < perPlayer; i++) {
      const card = state.drawPile.pop();
      if (!card) throw new Error("Stock ran dry while dealing");
      state.hands[seat]!.push(card);
    }
  }
}

/**
 * Shuffle with the seed and deal the first three cards to everyone. A party twist may
 * change the discard cap, or skip the trump phase altogether and deal all five at once.
 */
export function createRound(input: CreateRoundInput): RoundState {
  const rng = rngFromSeed(input.seed);
  const drawPile = shuffle(buildDeck(input.deck), rng);
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
    drawPile,
    currentTrick: { leader: leftOf(input.dealerSeat, input.seatCount), plays: [] },
    completedTricks: [],
    deltas: null,
    // Drawn after the shuffle so a classic and a party round from one seed deal alike.
    party:
      input.variant === "party"
        ? createPartyState(rng, input.seatCount, input.deck, input.inventory ?? [], input.previousTwist ?? null, drawPile, input.recentTwists ?? [])
        : null,
  };
  const rules = rulesFor(state);
  if (rules.maxDiscard !== null) state.maxDiscard = rules.maxDiscard;
  dealCards(state, 3);
  if (rules.noTrump) {
    // Nothing to name: everyone gets a full hand and the deciding starts at once.
    dealCards(state, HAND_SIZE - 3);
    state.phase = "discard";
  }
  // Nobody names the trump: everyone votes for it first, starting left of the dealer.
  if (rules.voteTrump) state.phase = "vote";
  return state;
}

/** Move every hand `offset` places along `ring` (a list of seats). Count-preserving. */
function rotateHands(state: RoundState, ring: readonly number[], offset: number): void {
  const moved = ring.map((seat) => state.hands[seat]!);
  ring.forEach((_, i) => {
    state.hands[ring[(i + offset) % ring.length]!] = moved[i]!;
  });
}

/**
 * Party "swap": once everyone has discarded or sat out, the hands of those still in may
 * all move round. The step drawn with the deal is folded into however many stayed in.
 */
function swapAfterDiscards(state: RoundState, players: readonly number[]): void {
  const step = state.party!.swapOffset;
  if (step <= 0 || players.length < 2) return;
  rotateHands(state, players, 1 + ((step - 1) % (players.length - 1)));
}

/**
 * Party "pass": the cards go by themselves. Which slots of each hand go was drawn with the
 * deal, so nobody chooses and the seed decides. Every hand gives before any hand receives,
 * which is what keeps the count at five all round.
 */
function passAtRandom(state: RoundState, players: readonly number[]): void {
  const party = state.party!;
  const spec = rulesFor(state).pass!;
  if (players.length < 2) return;
  const offset = passOffset(spec.direction, players.length);
  const given = players.map((seat) => {
    const hand = state.hands[seat]!;
    const slots = new Set<number>();
    for (const i of party.passIndex[seat] ?? []) {
      if (slots.size >= spec.count) break;
      slots.add(i % hand.length);
    }
    // A round dealt before the slots were drawn is topped up from the front.
    for (let i = 0; slots.size < Math.min(spec.count, hand.length); i++) slots.add(i);
    const cards = [...slots].map((i) => hand[i]!);
    state.hands[seat] = hand.filter((c) => !cards.includes(c));
    return cards;
  });
  players.forEach((_, i) => state.hands[players[(i + offset) % players.length]!]!.push(...given[i]!));
}

/** Who takes first from what lies in the middle: the seat furthest from zero, then on down. */
function takeOrder(players: readonly number[], ctx: RoundContext | undefined): number[] {
  return [...players].sort((a, b) => (ctx?.scores[b] ?? 0) - (ctx?.scores[a] ?? 0));
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
    party: state.party ? clonePartyState(state.party) : null,
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

/** `scores` are the table's before the round; only Robin Hood reads them, and only a move can supply them. */
function scoreRound(state: RoundState, events: RoundEvent[], scores?: readonly number[]): void {
  if (state.party) {
    state.deltas = partyDeltas({
      party: state.party,
      seats: state.seats,
      completedTricks: state.completedTricks,
      trump: state.trump,
      blankPenalty: state.blankPenalty,
      darkHearts: state.darkHearts,
      scores,
    });
    if (state.party.twist === "robinHood") {
      state.party.robinSwap = robinHoodPair(
        state.seats.map((s, seat) => ({ seat, participated: s.decision === "in" })),
        scores,
      );
    }
  } else {
    const deltas = roundDeltas(
      state.seats.map((s, seat) => ({
        seat,
        participated: s.decision === "in",
        tricksWon: s.tricksWon,
      })),
      state.trump,
      state.blankPenalty,
      state.darkHearts,
    );
    state.deltas = state.seats.map((_, seat) => deltas.get(seat) ?? 0);
  }
  state.phase = "scored";
  state.turnSeat = null;
  events.push({ type: "scored", deltas: state.deltas });
}

function startTricks(state: RoundState): void {
  const players = inSeats(state);
  if (rulesFor(state).faceUp) {
    // One card per hand goes face up, chosen with the deal and kept until it is played.
    for (const seat of players) {
      const hand = state.hands[seat]!;
      state.party!.faceUp[seat] = hand[state.party!.faceUpIndex[seat]! % hand.length] ?? null;
    }
  }
  state.phase = "tricks";
  const leader = players[0]!;
  state.currentTrick = { leader, plays: [] };
  state.turnSeat = leader;
}

function finishDiscardPhase(state: RoundState, events: RoundEvent[], ctx?: RoundContext): void {
  const players = inSeats(state);
  if (players.length === 0) {
    scoreRound(state, events, ctx?.scores);
    return;
  }
  if (players.length === 1) {
    // Nobody to play against: the lone player takes every trick.
    state.seats[players[0]!]!.tricksWon = TRICKS_PER_ROUND;
    scoreRound(state, events, ctx?.scores);
    return;
  }
  const rules = rulesFor(state);
  if (rules.swapHands) swapAfterDiscards(state, players);
  if (rules.pass) passAtRandom(state, players);
  if (rules.market) {
    state.phase = "pass";
    state.turnSeat = players[0]!;
    return;
  }
  if (rules.dummy) {
    // The spare hand comes off what is left of the stock, which a big table may have
    // nearly emptied: it is "up to seven" cards.
    const party = state.party!;
    party.dummy = state.drawPile.splice(Math.max(0, state.drawPile.length - DUMMY_SIZE));
    party.dummyTurn = 0;
    // The seat with the most points picks first, as at the market.
    party.marketOrder = takeOrder(players, ctx);
    state.phase = "dummy";
    state.turnSeat = party.marketOrder[0]!;
    return;
  }
  startTricks(state);
}

/**
 * Everyone has chosen. Passing: the cards travel round the ring of seats still in. Market:
 * they go face up in the middle, and the seat furthest from zero takes first.
 */
function deliverPasses(state: RoundState, ctx: RoundContext): void {
  const party = state.party!;
  const rules = rulesFor(state);
  const ring = inSeats(state);
  if (rules.market) {
    party.market = ring.flatMap((seat) => party.passes[seat] ?? []);
    party.marketOrder = [...ring].sort((a, b) => (ctx.scores[b] ?? 0) - (ctx.scores[a] ?? 0));
    for (const seat of ring) party.passes[seat] = null;
    state.phase = "market";
    state.turnSeat = party.marketOrder[0]!;
    return;
  }
  const offset = passOffset(rules.pass!.direction, ring.length);
  ring.forEach((seat, i) => {
    state.hands[ring[(i + offset) % ring.length]!]!.push(...(party.passes[seat] ?? []));
    party.passes[seat] = null;
  });
  startTricks(state);
}

function advanceDiscardTurn(state: RoundState, events: RoundEvent[], ctx?: RoundContext): void {
  const pending = playOrder(state.dealerSeat, state.seatCount).find(
    (s) => state.seats[s]!.decision === "pending",
  );
  if (pending === undefined) {
    finishDiscardPhase(state, events, ctx);
  } else {
    state.turnSeat = pending;
  }
}

/** Deal everyone up to a full hand and hand the turn to the first decider. */
function finishTrumpPhase(state: RoundState, events: RoundEvent[], ctx?: RoundContext): void {
  dealCards(state, HAND_SIZE - 3);
  events.push({ type: "dealt", count: HAND_SIZE - 3 });
  state.phase = "discard";
  // Left of the dealer decides first, which is where advanceDiscardTurn starts looking.
  // Going straight there would sit the turn on a seat that gave up during the trump phase.
  advanceDiscardTurn(state, events, ctx);
}

/** The seat still to vote, in play order, or undefined once everyone still in has. */
function nextVoter(state: RoundState): number | undefined {
  return playOrder(state.dealerSeat, state.seatCount).find(
    (s) => state.seats[s]!.decision === "pending" && state.party!.votes[s] === null,
  );
}

/**
 * Party "voteTrump": the suit with the most votes is trump. A tie goes to the earliest of
 * the tied votes in play order. No seat is the namer, so nobody is committed by it.
 */
function resolveVotes(state: RoundState, events: RoundEvent[], ctx?: RoundContext): void {
  const votes = state.party!.votes;
  const count = new Map<Suit, number>();
  for (const v of votes) if (v) count.set(v, (count.get(v) ?? 0) + 1);
  let best: Suit | null = null;
  for (const seat of playOrder(state.dealerSeat, state.seatCount)) {
    const v = votes[seat];
    if (v && (best === null || (count.get(v) ?? 0) > (count.get(best) ?? 0))) best = v;
  }
  // Nobody left to vote at all: the round still needs a trump to be scored under.
  state.trump = best ?? "S";
  state.trumpSeat = null;
  events.push({ type: "trumpVoted", suit: state.trump });
  finishTrumpPhase(state, events, ctx);
}

function fail(code: EngineError["code"], message?: string): ApplyResult {
  return { ok: false, error: new EngineError(code, message) };
}

/**
 * Powerups do not wait for a turn: any seat may spend one while the round is being
 * decided or played, and the turn stays where it was.
 */
function applyPowerupAction(prev: RoundState, action: PowerupAction): ApplyResult {
  if (!prev.party) return fail("notPartyTable");
  const blocked = powerupBlockedReason(prev.party, action, {
    phase: prev.phase,
    seatCount: prev.seatCount,
    decisions: prev.seats.map((s) => s.decision),
  });
  if (blocked) return fail(blocked);
  const state = clone(prev);
  applyPowerup(state.party!, action);
  const event: PowerupEvent = { type: "powerupUsed", seat: action.seat, powerup: action.powerup };
  if (action.target !== undefined) event.target = action.target;
  return { ok: true, state, events: [event] };
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
  if (action.type === "usePowerup") return applyPowerupAction(prev, action);
  if (prev.turnSeat !== action.seat) return fail("notYourTurn");
  const state = clone(prev);
  const events: RoundEvent[] = [];
  const seatState = state.seats[action.seat]!;
  const hand = state.hands[action.seat]!;

  switch (action.type) {
    case "vote": {
      if (state.phase !== "vote") return fail("wrongPhase");
      if (!SUITS.includes(action.suit)) return fail("invalidSuit");
      const party = state.party!;
      if (party.votes[action.seat] !== null) return fail("alreadyVoted");
      party.votes[action.seat] = action.suit;
      events.push({ type: "voted", seat: action.seat });
      const waiting = nextVoter(state);
      if (waiting === undefined) resolveVotes(state, events, ctx);
      else state.turnSeat = waiting;
      return { ok: true, state, events };
    }

    case "nameTrump": {
      if (state.phase !== "trump") return fail("wrongPhase");
      if (!SUITS.includes(action.suit)) return fail("invalidSuit");
      state.trump = action.suit;
      state.trumpSeat = action.seat;
      events.push({ type: "trumpNamed", seat: action.seat, suit: action.suit });
      finishTrumpPhase(state, events, ctx);
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
      finishTrumpPhase(state, events, ctx);
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
      finishTrumpPhase(state, events, ctx);
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
      // The marked card stays where it was dealt: it has to be played out.
      if (state.party?.markedCard && action.cards.includes(state.party.markedCard)) return fail("markedCardStays");
      const kept = hand.filter((c) => !action.cards.includes(c));
      for (let i = 0; i < action.cards.length; i++) kept.push(state.drawPile.pop()!);
      state.hands[action.seat] = kept;
      seatState.decision = "in";
      seatState.discardCount = action.cards.length;
      events.push({ type: "discarded", seat: action.seat, count: action.cards.length });
      advanceDiscardTurn(state, events, ctx);
      return { ok: true, state, events };
    }

    case "sitOut": {
      if (state.phase !== "discard") return fail("wrongPhase");
      if (seatState.decision !== "pending") return fail("alreadyDecided");
      const blocked = sitOutBlockedReason({
        score: ctx.scores[action.seat] ?? 0,
        forcedPlayThreshold: ctx.forcedPlayThreshold,
        consecutiveSitOuts: ctx.sitOutStreak[action.seat] ?? 0,
        trump: state.trump,
        isTrumpNamer: state.trumpSeat === action.seat && state.flipped === null,
        allIn: rulesFor(state).allIn,
        holdsMarkedCard: state.party?.markedCard !== null && state.party?.markedCard !== undefined && hand.includes(state.party.markedCard),
      });
      if (blocked === "trumpNamer") return fail("sitOutTrumpNamer");
      if (blocked === "allIn") return fail("sitOutAllIn");
      if (blocked === "markedCard") return fail("sitOutMarked");
      if (blocked === "clubs") return fail("sitOutClubs");
      if (blocked === "belowThreshold") return fail("sitOutBelowThreshold");
      if (blocked === "maxConsecutive") return fail("sitOutMaxConsecutive");
      seatState.decision = "out";
      events.push({ type: "satOut", seat: action.seat });
      advanceDiscardTurn(state, events, ctx);
      return { ok: true, state, events };
    }

    case "pass": {
      if (state.phase !== "pass") return fail("wrongPhase");
      const party = state.party!;
      if (party.passes[action.seat] !== null) return fail("alreadyPassed");
      const count = rulesFor(state).market ? 1 : rulesFor(state).pass!.count;
      if (action.cards.length !== count) return fail("wrongPassCount");
      if (new Set(action.cards).size !== action.cards.length) return fail("duplicateCards");
      for (const card of action.cards) {
        if (!isCard(card, state.deck) || !hand.includes(card)) return fail("cardNotInHand", String(card));
      }
      state.hands[action.seat] = hand.filter((c) => !action.cards.includes(c));
      party.passes[action.seat] = [...action.cards];
      events.push({ type: "passed", seat: action.seat });
      const waiting = inSeats(state).find((s) => party.passes[s] === null);
      if (waiting === undefined) deliverPasses(state, ctx);
      else state.turnSeat = waiting;
      return { ok: true, state, events };
    }

    case "take": {
      if (state.phase !== "market") return fail("wrongPhase");
      const party = state.party!;
      if (!isCard(action.card, state.deck) || !party.market.includes(action.card)) {
        return fail("cardNotInMarket", String(action.card));
      }
      party.market = party.market.filter((c) => c !== action.card);
      hand.push(action.card);
      events.push({ type: "took", seat: action.seat, card: action.card });
      const taken = inSeats(state).length - party.market.length;
      if (party.market.length === 0) startTricks(state);
      else state.turnSeat = party.marketOrder[taken]!;
      return { ok: true, state, events };
    }

    case "dummy": {
      if (state.phase !== "dummy") return fail("wrongPhase");
      const party = state.party!;
      const { give, take } = action;
      if ((give === undefined) !== (take === undefined)) return fail("dummyNeedsBoth");
      if (give !== undefined && take !== undefined) {
        if (!isCard(give, state.deck) || !hand.includes(give)) return fail("cardNotInHand", String(give));
        if (!isCard(take, state.deck) || !party.dummy.includes(take)) return fail("cardNotInDummy", String(take));
        state.hands[action.seat] = [...hand.filter((c) => c !== give), take];
        party.dummy = [...party.dummy.filter((c) => c !== take), give];
      }
      events.push({ type: "dummySwapped", seat: action.seat, give: give ?? null, take: take ?? null });
      party.dummyTurn += 1;
      const players = inSeats(state);
      if (party.dummyTurn >= players.length) startTricks(state);
      else state.turnSeat = party.marketOrder[party.dummyTurn] ?? players[party.dummyTurn]!;
      return { ok: true, state, events };
    }

    case "play": {
      if (state.phase !== "tricks") return fail("wrongPhase");
      if (!isCard(action.card, state.deck) || !hand.includes(action.card)) {
        return fail("cardNotInHand", String(action.card));
      }
      const rules = rulesFor(state);
      const legal = legalPlays(hand, state.currentTrick, state.trump, state.deck, rules);
      if (!legal.includes(action.card)) return fail("illegalPlay");
      state.hands[action.seat] = hand.filter((c) => c !== action.card);
      if (state.party && state.party.faceUp[action.seat] === action.card) state.party.faceUp[action.seat] = null;
      state.currentTrick.plays.push({ seat: action.seat, card: action.card });
      events.push({ type: "played", seat: action.seat, card: action.card });

      const players = inSeats(state);
      if (state.currentTrick.plays.length < players.length) {
        state.turnSeat = nextInSeat(state, action.seat);
        return { ok: true, state, events };
      }

      const winner = trickWinner(state.currentTrick.plays, state.trump, state.deck, rules.lowWins, rules.wildRank);
      state.seats[winner]!.tricksWon += 1;
      state.completedTricks.push({ ...state.currentTrick, winner });
      events.push({ type: "trickWon", seat: winner, trickIndex: state.completedTricks.length - 1 });
      if (state.completedTricks.length >= TRICKS_PER_ROUND) {
        scoreRound(state, events, ctx.scores);
      } else {
        if (rules.carousel) {
          // Party "carousel": whatever is left in every hand moves one seat to the left,
          // face-up cards included, since they travel with the hand.
          rotateHands(state, players, 1);
          if (rules.faceUp) state.party!.faceUp = state.party!.faceUp.map(() => null);
        }
        if (rules.musicalTricks) {
          // Party "musicalTricks": the tricks already won move one seat to the left too.
          const won = players.map((s) => state.seats[s]!.tricksWon);
          players.forEach((_, i) => {
            state.seats[players[(i + 1) % players.length]!]!.tricksWon = won[i]!;
          });
        }
        // Party "fog": the lead goes round the table rather than to the winner, so the
        // trick collected face down gives nothing away.
        const leader = rules.fog ? nextInSeat(state, state.currentTrick.leader) : winner;
        state.currentTrick = { leader, plays: [] };
        state.turnSeat = leader;
      }
      return { ok: true, state, events };
    }
  }
}

/**
 * A seat gives up mid-round, and the round carries on without it.
 *
 * Dealing again was the old answer, and at a table where somebody drops every few rounds
 * it meant nobody ever got to play one out. So the cards go back under the stock -- under,
 * not on top, so nobody draws a card the person who left has already seen -- and the seat
 * simply sits this round out. If the table was waiting on it, the turn moves along: the
 * trump choice passes to the next seat round from the dealer, and a pending decision is
 * skipped exactly as a sit-out would be.
 *
 * A seat already committed to the round is left alone: its cards have to be played out,
 * and that is somebody else's job.
 */
export function withdrawSeat(prev: RoundState, seat: number): RoundState {
  if (prev.phase === "scored") return prev;
  if (!Number.isInteger(seat) || seat < 0 || seat >= prev.seatCount) return prev;
  if (prev.seats[seat]!.decision !== "pending") return prev;
  const state = clone(prev);
  const events: RoundEvent[] = [];
  state.drawPile.unshift(...state.hands[seat]!);
  state.hands[seat] = [];
  state.seats[seat]!.decision = "out";
  state.seats[seat]!.discardCount = 0;
  if (state.turnSeat !== seat) return state;
  if (state.phase === "vote") {
    const next = nextVoter(state);
    if (next === undefined) resolveVotes(state, events);
    else state.turnSeat = next;
    return state;
  }
  if (state.phase === "trump") {
    // The trump is always settled by the first seat still in play order, so the first one
    // left pending is the one the choice falls to.
    const next = playOrder(state.dealerSeat, state.seatCount).find(
      (s) => state.seats[s]!.decision === "pending",
    );
    if (next === undefined) scoreRound(state, events);
    else state.turnSeat = next;
    return state;
  }
  advanceDiscardTurn(state, events);
  return state;
}
