/** Suits: Copas (H), Ouros (D), Paus (C), Espadas (S). */
export type Suit = "H" | "D" | "C" | "S";
export type Rank =
  | "A" | "7" | "K" | "J" | "Q" | "10" | "9" | "8" | "6" | "5" | "4" | "3" | "2";
export type Card = `${Rank}${Suit}`;
export type DeckSize = 40 | 52;

export const SUITS: readonly Suit[] = ["H", "D", "C", "S"];

/** High to low. */
export const RANKS_40: readonly Rank[] = ["A", "7", "K", "J", "Q", "6", "5", "4", "3", "2"];
export const RANKS_52: readonly Rank[] = [
  "A", "7", "K", "J", "Q", "10", "9", "8", "6", "5", "4", "3", "2",
];

export function ranksFor(deck: DeckSize): readonly Rank[] {
  return deck === 40 ? RANKS_40 : RANKS_52;
}

export function suitOf(card: Card): Suit {
  return card.charAt(card.length - 1) as Suit;
}

export function rankOf(card: Card): Rank {
  return card.slice(0, -1) as Rank;
}

export function makeCard(rank: Rank, suit: Suit): Card {
  return `${rank}${suit}`;
}

/** Higher value = stronger card. Ace is strongest, 2 is weakest (value 1). */
export function rankValue(card: Card, deck: DeckSize): number {
  const ranks = ranksFor(deck);
  const idx = ranks.indexOf(rankOf(card));
  if (idx < 0) throw new Error(`Card ${card} is not in the ${deck}-card deck`);
  return ranks.length - idx;
}

export function isCard(value: unknown, deck: DeckSize): value is Card {
  if (typeof value !== "string" || value.length < 2) return false;
  const suit = value.charAt(value.length - 1);
  const rank = value.slice(0, -1);
  return (SUITS as readonly string[]).includes(suit) &&
    (ranksFor(deck) as readonly string[]).includes(rank);
}

export function buildDeck(deck: DeckSize): Card[] {
  const out: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of ranksFor(deck)) out.push(makeCard(rank, suit));
  }
  return out;
}

/** Sort a hand for display: by suit (H, D, C, S) then strongest first. */
export function sortHand(hand: readonly Card[], deck: DeckSize, trump?: Suit): Card[] {
  const suitOrder = (s: Suit) => (s === trump ? -1 : SUITS.indexOf(s));
  return [...hand].sort((a, b) => {
    const sa = suitOrder(suitOf(a));
    const sb = suitOrder(suitOf(b));
    if (sa !== sb) return sa - sb;
    return rankValue(b, deck) - rankValue(a, deck);
  });
}

export const SUIT_NAMES_PT: Record<Suit, string> = {
  H: "Copas",
  D: "Ouros",
  C: "Paus",
  S: "Espadas",
};

export const SUIT_SYMBOLS: Record<Suit, string> = { H: "♥", D: "♦", C: "♣", S: "♠" };
