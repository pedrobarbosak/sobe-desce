import { type Card, type DeckSize, type Suit, makeCard, suitOf } from "./cards";
import { MAX_CONSECUTIVE_SIT_OUTS } from "./config";
import { type TrickInProgress, beats, currentWinner, ledSuit } from "./trick";

export type IllegalReason =
  | "mustLeadTrumpAce"
  | "mustFollowSuit"
  | "mustTrump"
  | "mustClimb" // the "sobe" rule: you can beat the winning card, so you must
  | "notInHand";

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
 */
export function legalPlays(
  hand: readonly Card[],
  trick: TrickInProgress,
  trump: Suit,
  deck: DeckSize,
): Card[] {
  if (hand.length === 0) return [];
  const led = ledSuit(trick.plays);
  if (!led) {
    const ace = makeCard("A", trump);
    return hand.includes(ace) ? [ace] : [...hand];
  }
  const winning = currentWinner(trick.plays, trump, deck)!;

  const ofLed = hand.filter((c) => suitOf(c) === led);
  if (ofLed.length > 0) {
    const climbers = ofLed.filter((c) => beats(c, winning.card, trump, deck));
    return climbers.length > 0 ? climbers : ofLed;
  }

  const climbers = hand.filter((c) => suitOf(c) === trump && beats(c, winning.card, trump, deck));
  if (climbers.length > 0) return climbers;

  return [...hand];
}

/** Why a specific card is not playable right now, or null when it is legal. */
export function illegalReason(
  hand: readonly Card[],
  card: Card,
  trick: TrickInProgress,
  trump: Suit,
  deck: DeckSize,
): IllegalReason | null {
  if (!hand.includes(card)) return "notInHand";
  const legal = legalPlays(hand, trick, trump, deck);
  if (legal.includes(card)) return null;
  const led = ledSuit(trick.plays);
  if (!led) return "mustLeadTrumpAce";
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
  trump: Suit;
  /** The seat that named the trump is committed to the round. */
  isTrumpNamer?: boolean;
};

export type SitOutBlock = "belowThreshold" | "maxConsecutive" | "clubs" | "trumpNamer";

export function sitOutBlockedReason(ctx: SitOutContext): SitOutBlock | null {
  if (ctx.isTrumpNamer) return "trumpNamer";
  if (ctx.trump === "C") return "clubs";
  if (ctx.score < ctx.forcedPlayThreshold) return "belowThreshold";
  if (ctx.consecutiveSitOuts >= MAX_CONSECUTIVE_SIT_OUTS) return "maxConsecutive";
  return null;
}

export function canSitOut(ctx: SitOutContext): boolean {
  return sitOutBlockedReason(ctx) === null;
}
