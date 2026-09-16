import type { IconType } from "react-icons";
import { LuEye, LuShield, LuSkull } from "react-icons/lu";
import { LIGHTNING_SECONDS, type PassSpec, type Powerup, type Rank, type Suit, type Twist } from "@/engine";

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
};

/** `t` for keys built at runtime, which the typed one rejects. */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

export const POWERUP_ICONS: Record<Powerup, IconType> = { peek: LuEye, curse: LuSkull, shield: LuShield };

/** Interpolation values every twist description may use. */
export function twistVars(party: PartyView, t: Translate): Record<string, unknown> {
  return {
    suit: party.goldenSuit ? t(`suits.${party.goldenSuit}`).split(" ")[0] : "",
    seconds: LIGHTNING_SECONDS,
    rank: party.wildRank ?? "",
    count: party.pass?.count ?? 1,
  };
}

/** The twist's name with its drawn parameter filled in, for chips and banners. */
export function twistName(party: PartyView, t: Translate): string {
  if (party.twist === "pass" && party.pass) return t(`party.passNames.${party.pass.direction}`, { count: party.pass.count });
  return t(`party.twists.${party.twist}.name`, twistVars(party, t));
}
