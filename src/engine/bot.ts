import { type Card, type Suit, SUITS, rankValue, suitOf } from "./cards";
import { canSitOut, legalPlays } from "./legal";
import { type Action, type RoundContext, type RoundState } from "./round";
import { beats, currentWinner } from "./trick";

function lowest(cards: readonly Card[], state: RoundState): Card {
  return [...cards].sort((a, b) => rankValue(a, state.deck) - rankValue(b, state.deck))[0]!;
}

function bestSuit(hand: readonly Card[], state: RoundState): Suit {
  let best: Suit = "S";
  let bestScore = -1;
  for (const suit of SUITS) {
    const cards = hand.filter((c) => suitOf(c) === suit);
    const score = cards.length * 100 + cards.reduce((s, c) => s + rankValue(c, state.deck), 0);
    if (score > bestScore) {
      bestScore = score;
      best = suit;
    }
  }
  return best;
}

/**
 * Default action on turn timeout: the least committal legal move.
 * trump → the suit you hold most of; discard → keep everything (commits you); play → lowest legal card.
 */
export function autoPlay(state: RoundState, seat: number): Action {
  const hand = state.hands[seat]!;
  switch (state.phase) {
    case "trump":
      return { type: "nameTrump", seat, suit: bestSuit(hand, state) };
    case "discard":
      return { type: "discard", seat, cards: [] };
    case "tricks": {
      const legal = legalPlays(hand, state.currentTrick, state.trump!, state.deck);
      return { type: "play", seat, card: lowest(legal, state) };
    }
    case "scored":
      throw new Error("Round already scored");
  }
}

function handStrength(hand: readonly Card[], trump: Suit, state: RoundState): number {
  return hand.reduce((s, c) => {
    const v = rankValue(c, state.deck);
    return s + (suitOf(c) === trump ? v * 2 : v);
  }, 0);
}

/** A slightly smarter policy for bot seats. */
export function chooseAction(state: RoundState, seat: number, ctx: RoundContext): Action {
  const hand = state.hands[seat]!;
  switch (state.phase) {
    case "trump": {
      // Three cards in three different suits says nothing about what to call, so let the
      // deck decide and keep the right to sit the round out.
      const suits = new Set(hand.map((c) => suitOf(c)));
      if (suits.size === hand.length && state.drawPile.length > 0) return { type: "flipTrump", seat };
      return { type: "nameTrump", seat, suit: bestSuit(hand, state) };
    }

    case "discard": {
      const trump = state.trump!;
      const maxStrength = state.deck === 40 ? 10 : 13;
      const weak = handStrength(hand, trump, state) < maxStrength * 2.5;
      const allowed = canSitOut({
        score: ctx.scores[seat] ?? 0,
        forcedPlayThreshold: ctx.forcedPlayThreshold,
        consecutiveSitOuts: ctx.sitOutStreak[seat] ?? 0,
        trump,
        isTrumpNamer: state.trumpSeat === seat,
      });
      if (weak && allowed) return { type: "sitOut", seat };
      const threshold = maxStrength - 2; // keep A, 7, K
      const junk = hand
        .filter((c) => suitOf(c) !== trump && rankValue(c, state.deck) < threshold)
        .sort((a, b) => rankValue(a, state.deck) - rankValue(b, state.deck))
        .slice(0, state.maxDiscard);
      return { type: "discard", seat, cards: junk };
    }

    case "tricks": {
      const trump = state.trump!;
      const legal = legalPlays(hand, state.currentTrick, trump, state.deck);
      const winning = currentWinner(state.currentTrick.plays, trump, state.deck);
      if (!winning) {
        // Leading: lead the strongest non-trump if we have one, otherwise lowest.
        const nonTrump = legal.filter((c) => suitOf(c) !== trump);
        if (nonTrump.length > 0) {
          return {
            type: "play",
            seat,
            card: [...nonTrump].sort((a, b) => rankValue(b, state.deck) - rankValue(a, state.deck))[0]!,
          };
        }
        return { type: "play", seat, card: lowest(legal, state) };
      }
      const winners = legal.filter((c) => beats(c, winning.card, trump, state.deck));
      if (winners.length > 0) return { type: "play", seat, card: lowest(winners, state) };
      return { type: "play", seat, card: lowest(legal, state) };
    }

    case "scored":
      throw new Error("Round already scored");
  }
}
