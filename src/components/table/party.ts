import type { IconType } from "react-icons";
import { LuEye, LuShield, LuSkull } from "react-icons/lu";
import { type Card, LIGHTNING_SECONDS, MARKED_CARD_POINTS, type PassSpec, type Powerup, type Rank, SUIT_SYMBOLS, type Suit, type Twist, rankOf, suitOf } from "@/engine";

/** The round's twist and the public trace of powerups, as the table query sends them. */
export type PartyView = {
  twist: Twist;
  goldenSuit: Suit | null;
  pass: PassSpec | null;
  wildRank: Rank | null;
  faceUp: (string | null)[];
  market: string[];
  marketOrder: number[];
  dummy: string[];
  dummyTurn: number;
  /** Only sent once the round is scored. */
  guardians: number[] | null;
  /** `swap`, once the deciding is over: did the hands actually move? */
  swapped: boolean | null;
  shielded: boolean[];
  curses: number[];
  peeks: { seat: number; target: number }[];
  awards: { seat: number; powerup: Powerup }[];
  /** `team`: each seat's partner, public from the deal. */
  teams: number[] | null;
  /** `nemesis`: only sent once the round is scored. */
  nemeses: number[] | null;
  /** `markedCard`: the card whose trick costs extra. */
  markedCard: Card | null;
  /** `voteTrump`: who has voted. */
  voted: boolean[];
  /** `robinHood`, once scored: the two seats whose results were swapped. */
  robinSwap: number[] | null;
};

/** A card as a short label: rank and suit glyph. */
export function cardLabel(card: string): string {
  return `${rankOf(card as Card)}${SUIT_SYMBOLS[suitOf(card as Card)]}`;
}

/** `t` for keys built at runtime, which the typed one rejects. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export const POWERUP_ICONS: Record<Powerup, IconType> = { peek: LuEye, curse: LuSkull, shield: LuShield };

/** What the names and descriptions of twists are built from. */
export type TwistFacts = { twist: Twist; goldenSuit: Suit | null; pass: PassSpec | null; wildRank: string | null; markedCard: string | null };

/** Interpolation values every twist description may use. */
export function twistVars(party: TwistFacts, t: Translate): Record<string, unknown> {
  return {
    suit: party.goldenSuit ? t(`suits.${party.goldenSuit}`).split(" ")[0] : "",
    seconds: LIGHTNING_SECONDS,
    rank: party.wildRank ?? "",
    count: party.pass?.count ?? 1,
    card: party.markedCard ? cardLabel(party.markedCard) : "",
    points: MARKED_CARD_POINTS,
  };
}

/** The twist's name with its drawn parameter filled in, for chips and banners. */
export function twistName(party: TwistFacts, t: Translate): string {
  if (party.twist === "pass" && party.pass) return t(`party.passNames.${party.pass.direction}`, { count: party.pass.count });
  return t(`party.twists.${party.twist}.name`, twistVars(party, t));
}
