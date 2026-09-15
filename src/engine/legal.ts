import { type Card, type DeckSize, type Suit, makeCard, rankOf, ranksFor, suitOf } from "./cards";
import { MAX_CONSECUTIVE_SIT_OUTS } from "./config";
import { CLASSIC_RULES, type RoundRules } from "./rules";
import { type TrickInProgress, beats, currentWinner, ledSuit } from "./trick";

export type IllegalReason =
  | "mustLeadTrumpAce"
  | "mustLeadTrumpLow" // Desce: the lowest trump is the unbeatable card, so it leads
  | "mustFollowSuit"
  | "mustTrump"
  | "mustClimb" // the "sobe" rule: you can beat the winning card, so you must
  | "notInHand";

/** The trump nobody can beat: the Ace, or the lowest rank when the round plays low. */
export function unbeatableTrump(trump: Suit | null, deck: DeckSize, rules: RoundRules = CLASSIC_RULES): Card | null {
  if (!trump) return null;
  const ranks = ranksFor(deck);
  return makeCard(rules.lowWins ? ranks[ranks.length - 1]! : "A", trump);
}

/**
 * The single source of truth for legal plays. Used by the server to validate and by the
 * client to grey out cards.
 *
 * 1. Leading: if you hold the Ace of trumps you must lead it, otherwise anything goes.
 * 2. Following: you must follow the led suit if you can. If you can beat the winning card
 *    with a card of that suit, you must ("sobe").
 * 3. Void in the led suit: you must trump only if one of your trumps actually beats the
 *    winning card, and then you must play a beating one. A trump too low to win frees you.
 * 4. Nothing that can beat the winning card: anything goes.
 *
 * Under `rules.lowWins` every "beats" above reads the other way round, and the card you
 * must lead is the lowest trump rather than the Ace. Under `rules.freeForAll` none of it
 * applies. A card of `rules.wildRank` may always be played and is never forced: it beats
 * everything, so the climb rule would otherwise make you spend it at once.
 */
export function legalPlays(
  hand: readonly Card[],
  trick: TrickInProgress,
  trump: Suit | null,
  deck: DeckSize,
  rules: RoundRules = CLASSIC_RULES,
): Card[] {
  if (hand.length === 0) return [];
  if (rules.freeForAll) return [...hand];
  const wilds = rules.wildRank === null ? [] : hand.filter((c) => rankOf(c) === rules.wildRank);
  const withWilds = (cards: Card[]) => [...cards, ...wilds.filter((w) => !cards.includes(w))];
  const led = ledSuit(trick.plays);
  if (!led) {
    const top = unbeatableTrump(trump, deck, rules);
    return top && hand.includes(top) ? withWilds([top]) : [...hand];
  }
  const winning = currentWinner(trick.plays, trump, deck, rules.lowWins, rules.wildRank)!;
  const canBeat = (c: Card) => !wilds.includes(c) && beats(c, winning.card, trump, deck, rules.lowWins, rules.wildRank);

  const ofLed = hand.filter((c) => suitOf(c) === led);
  if (ofLed.length > 0) {
    const climbers = ofLed.filter(canBeat);
    return withWilds(climbers.length > 0 ? climbers : ofLed);
  }

  const climbers = hand.filter((c) => suitOf(c) === trump && canBeat(c));
  if (climbers.length > 0) return withWilds(climbers);

  return [...hand];
}

/** Why a specific card is not playable right now, or null when it is legal. */
export function illegalReason(
  hand: readonly Card[],
  card: Card,
  trick: TrickInProgress,
  trump: Suit | null,
  deck: DeckSize,
  rules: RoundRules = CLASSIC_RULES,
): IllegalReason | null {
  if (!hand.includes(card)) return "notInHand";
  const legal = legalPlays(hand, trick, trump, deck, rules);
  if (legal.includes(card)) return null;
  const led = ledSuit(trick.plays);
  if (!led) return rules.lowWins ? "mustLeadTrumpLow" : "mustLeadTrumpAce";
  const cardSuit = suitOf(card);
  const hasLed = hand.some((c) => suitOf(c) === led);
  if (hasLed) return cardSuit === led ? "mustClimb" : "mustFollowSuit";
  // Void in the led suit and still illegal: a beating trump exists in the hand.
  return cardSuit === trump ? "mustClimb" : "mustTrump";
}

export type SitOutContext = {
  score: number;
  forcedPlayThreshold: number;
  consecutiveSitOuts: number;
  trump: Suit | null;
  /** The seat that named the trump is committed to the round. */
  isTrumpNamer?: boolean;
  /** Party: the round's twist keeps everyone in. */
  allIn?: boolean;
};

export type SitOutBlock = "belowThreshold" | "maxConsecutive" | "clubs" | "trumpNamer" | "allIn";

export function sitOutBlockedReason(ctx: SitOutContext): SitOutBlock | null {
  if (ctx.isTrumpNamer) return "trumpNamer";
  if (ctx.allIn) return "allIn";
  if (ctx.trump === "C") return "clubs";
  if (ctx.score < ctx.forcedPlayThreshold) return "belowThreshold";
  if (ctx.consecutiveSitOuts >= MAX_CONSECUTIVE_SIT_OUTS) return "maxConsecutive";
  return null;
}

export function canSitOut(ctx: SitOutContext): boolean {
  return sitOutBlockedReason(ctx) === null;
}
