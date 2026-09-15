import { type Card, type Suit, SUITS, ranksFor, rankValue, suitOf } from "./cards";
import { canSitOut, legalPlays } from "./legal";
import { type PowerupAction } from "./party";
import { type Action, type RoundContext, type RoundState, rulesFor } from "./round";
import type { RoundRules } from "./rules";
import { beats, currentWinner } from "./trick";

/** How strong a card is this round: rank, or its mirror image when the low card wins. */
function power(card: Card, state: RoundState, rules: RoundRules): number {
  const v = rankValue(card, state.deck);
  return rules.lowWins ? ranksFor(state.deck).length + 1 - v : v;
}

function weakest(cards: readonly Card[], state: RoundState, rules: RoundRules): Card {
  return [...cards].sort((a, b) => power(a, state, rules) - power(b, state, rules))[0]!;
}

function strongest(cards: readonly Card[], state: RoundState, rules: RoundRules): Card {
  return [...cards].sort((a, b) => power(b, state, rules) - power(a, state, rules))[0]!;
}

function bestSuit(hand: readonly Card[], state: RoundState, rules: RoundRules): Suit {
  let best: Suit = "S";
  let bestScore = -1;
  for (const suit of SUITS) {
    const cards = hand.filter((c) => suitOf(c) === suit);
    const score = cards.length * 100 + cards.reduce((s, c) => s + power(c, state, rules), 0);
    if (score > bestScore) {
      bestScore = score;
      best = suit;
    }
  }
  return best;
}

/**
 * Default action on turn timeout: the least committal legal move.
 * trump → the suit you hold most of; discard → keep everything (commits you); play → weakest legal card.
 */
export function autoPlay(state: RoundState, seat: number): Action {
  const hand = state.hands[seat]!;
  const rules = rulesFor(state);
  switch (state.phase) {
    case "trump":
      return { type: "nameTrump", seat, suit: bestSuit(hand, state, rules) };
    case "discard":
      return { type: "discard", seat, cards: [] };
    case "pass":
      return { type: "pass", seat, card: weakest(hand, state, rules) };
    case "tricks": {
      const legal = legalPlays(hand, state.currentTrick, state.trump, state.deck, rules);
      return { type: "play", seat, card: weakest(legal, state, rules) };
    }
    case "scored":
      throw new Error("Round already scored");
  }
}

function handStrength(hand: readonly Card[], trump: Suit | null, state: RoundState, rules: RoundRules): number {
  return hand.reduce((s, c) => {
    const v = power(c, state, rules);
    return s + (suitOf(c) === trump ? v * 2 : v);
  }, 0);
}

/** A slightly smarter policy for bot seats. */
export function chooseAction(state: RoundState, seat: number, ctx: RoundContext): Action {
  const hand = state.hands[seat]!;
  const rules = rulesFor(state);
  switch (state.phase) {
    case "trump": {
      // Three cards in three different suits says nothing about what to call, so let the
      // deck decide and keep the right to sit the round out.
      const suits = new Set(hand.map((c) => suitOf(c)));
      if (suits.size === hand.length && state.drawPile.length > 0) return { type: "flipTrump", seat };
      return { type: "nameTrump", seat, suit: bestSuit(hand, state, rules) };
    }

    case "discard": {
      const trump = state.trump;
      const maxStrength = state.deck === 40 ? 10 : 13;
      const strength = handStrength(hand, trump, state, rules);
      // A round that pays for losing turns a strong hand into the one to avoid.
      const weak = rules.avoidTricks ? strength >= maxStrength * 2.5 : strength < maxStrength * 2.5;
      const allowed = canSitOut({
        score: ctx.scores[seat] ?? 0,
        forcedPlayThreshold: ctx.forcedPlayThreshold,
        consecutiveSitOuts: ctx.sitOutStreak[seat] ?? 0,
        trump,
        isTrumpNamer: state.trumpSeat === seat,
        allIn: rules.allIn,
      });
      if (weak && allowed) return { type: "sitOut", seat };
      const threshold = maxStrength - 2; // keep A, 7, K
      const junk = hand
        .filter((c) => suitOf(c) !== trump && (rules.avoidTricks ? power(c, state, rules) >= threshold : power(c, state, rules) < threshold))
        .sort((a, b) => (rules.avoidTricks ? -1 : 1) * (power(a, state, rules) - power(b, state, rules)))
        .slice(0, state.maxDiscard);
      return { type: "discard", seat, cards: junk };
    }

    case "pass": {
      // Spite where it costs nothing: the weakest non-trump goes left. When the round
      // pays for losing, the strongest card is the one to get rid of.
      const trump = state.trump;
      if (rules.avoidTricks) return { type: "pass", seat, card: strongest(hand, state, rules) };
      const nonTrump = hand.filter((c) => suitOf(c) !== trump);
      return { type: "pass", seat, card: weakest(nonTrump.length > 0 ? nonTrump : hand, state, rules) };
    }

    case "tricks": {
      const trump = state.trump;
      const legal = legalPlays(hand, state.currentTrick, trump, state.deck, rules);
      const winning = currentWinner(state.currentTrick.plays, trump, state.deck, rules.lowWins);
      if (rules.avoidTricks) {
        // Playing to lose: never take a trick you can duck, and when you cannot, shed
        // the strongest card since it is winning anyway.
        if (!winning) return { type: "play", seat, card: weakest(legal, state, rules) };
        const losers = legal.filter((c) => !beats(c, winning.card, trump, state.deck, rules.lowWins));
        if (losers.length > 0) return { type: "play", seat, card: strongest(losers, state, rules) };
        return { type: "play", seat, card: strongest(legal, state, rules) };
      }
      if (!winning) {
        // Leading: lead the strongest non-trump if we have one, otherwise weakest.
        const nonTrump = legal.filter((c) => suitOf(c) !== trump);
        if (nonTrump.length > 0) return { type: "play", seat, card: strongest(nonTrump, state, rules) };
        return { type: "play", seat, card: weakest(legal, state, rules) };
      }
      const winners = legal.filter((c) => beats(c, winning.card, trump, state.deck, rules.lowWins));
      if (winners.length > 0) return { type: "play", seat, card: weakest(winners, state, rules) };
      return { type: "play", seat, card: weakest(legal, state, rules) };
    }

    case "scored":
      throw new Error("Round already scored");
  }
}

/**
 * Party: whether a bot spends a powerup before its move. Shield when a blank looms, curse
 * and peek whoever is closest to winning. One per call; the caller applies it first.
 */
export function choosePowerup(state: RoundState, seat: number, ctx: RoundContext): PowerupAction | null {
  const party = state.party;
  if (!party || (state.phase !== "discard" && state.phase !== "tricks")) return null;
  const me = state.seats[seat]!;
  if (me.decision === "out") return null;
  const stash = party.inventory[seat] ?? [];
  if (stash.length === 0) return null;
  const rules = rulesFor(state);

  if (stash.includes("shield") && !party.shielded[seat] && !rules.avoidTricks) {
    const blankLooms = state.phase === "tricks" && me.decision === "in" && me.tricksWon === 0 && state.completedTricks.length >= 3;
    if (blankLooms) return { type: "usePowerup", seat, powerup: "shield" };
  }

  // The leader: lowest score among the other seats still in play.
  let target: number | null = null;
  for (let s = 0; s < state.seatCount; s++) {
    if (s === seat || state.seats[s]!.decision === "out") continue;
    if (target === null || (ctx.scores[s] ?? Infinity) < (ctx.scores[target] ?? Infinity)) target = s;
  }
  if (target === null) return null;
  if (stash.includes("curse")) return { type: "usePowerup", seat, powerup: "curse", target };
  if (stash.includes("peek") && !party.peeks.some((k) => k.seat === seat && k.target === target)) {
    return { type: "usePowerup", seat, powerup: "peek", target };
  }
  return null;
}
