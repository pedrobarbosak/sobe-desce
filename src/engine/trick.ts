import { type Card, type DeckSize, type Rank, type Suit, rankOf, rankValue, suitOf } from "./cards";

export type Play = { seat: number; card: Card };

/**
 * What a client sees in place of a card it may not know yet: the lead under the party
 * "blindLead" twist. Only ever produced by the server's redaction, never by the engine.
 */
export const HIDDEN_CARD = "??";
export type TrickInProgress = { leader: number; plays: Play[] };
export type CompletedTrick = TrickInProgress & { winner: number };

export function ledSuit(plays: readonly Play[]): Suit | undefined {
  const first = plays[0];
  return first ? suitOf(first.card) : undefined;
}

/**
 * The play currently winning the trick: highest trump, else highest card of the led suit.
 * With `lowWins` (the party "Desce" twist) the ranks read the other way round: trumps
 * still beat non-trumps, but within a suit the lowest card wins.
 */
export function currentWinner(
  plays: readonly Play[],
  trump: Suit | null,
  deck: DeckSize,
  lowWins = false,
  wildRank: Rank | null = null,
): Play | undefined {
  const led = ledSuit(plays);
  if (!led) return undefined;
  let best: Play | undefined;
  for (const play of plays) {
    if (!best) {
      best = play;
      continue;
    }
    if (beats(play.card, best.card, trump, deck, lowWins, wildRank)) best = play;
  }
  return best;
}

/**
 * Does `candidate` beat `incumbent` in a trick? Trumps beat non-trumps; within the same
 * suit the higher rank wins; a non-trump of a different suit never wins. With no trump
 * (party "Sem trunfo") only the led suit can win.
 */
export function beats(
  candidate: Card,
  incumbent: Card,
  trump: Suit | null,
  deck: DeckSize,
  lowWins = false,
  wildRank: Rank | null = null,
): boolean {
  if (wildRank !== null) {
    // Party "wildRank": the rank beats everything, and the first one played holds.
    if (rankOf(incumbent) === wildRank) return false;
    if (rankOf(candidate) === wildRank) return true;
  }
  const cs = suitOf(candidate);
  const is = suitOf(incumbent);
  if (cs === is) {
    const c = rankValue(candidate, deck);
    const i = rankValue(incumbent, deck);
    return lowWins ? c < i : c > i;
  }
  return cs === trump;
}

export function trickWinner(
  plays: readonly Play[],
  trump: Suit | null,
  deck: DeckSize,
  lowWins = false,
  wildRank: Rank | null = null,
): number {
  const winner = currentWinner(plays, trump, deck, lowWins, wildRank);
  if (!winner) throw new Error("Cannot resolve an empty trick");
  return winner.seat;
}
