import { useMemo } from "react";
import type { Ellipse, TrickSpread } from "@/components/table/geometry";

export type FeltInput = {
  /** The measured felt; zero before the first measurement. */
  felt: { w: number; h: number };
  /** The status card sits along the bottom edge rather than the top. */
  statusBelow: boolean;
  /** Other seats show whole hands face up above their avatars. */
  hasOpenHands: boolean;
  /** Party "faceUp": one card of each hand stands beside the backs, above the avatar. */
  hasFaceUp: boolean;
};

export type FeltLayout = {
  W: number;
  H: number;
  compact: boolean;
  /**
   * A landscape phone: a felt under 400px tall. Everything that is not the game leaves
   * the felt for the bar or the menu, and what stays scales with the height.
   */
  short: boolean;
  portrait: boolean;
  cardWidth: number;
  avatarSize: number;
  /** The badges on the viewer's own chip, which uses a smaller avatar. */
  myBadge: number;
  /** How far the fan hangs below the felt's bottom edge. */
  handOffset: number;
  /** The band along the bottom the fan occupies; everything else keeps above it. */
  handReserve: number;
  statusHeight: number;
  /** Where the status card sits when it is along the bottom edge. */
  statusBottom: number;
  ellipse: Ellipse;
  /** Where the trump, discard and party panels go. */
  panelStyle: React.CSSProperties;
  /** How far out from the centre played cards land. */
  trickSpread: TrickSpread;
  /** The ring's vertical budget, in px from the top of the felt. */
  budget: { topPad: number; bottomPad: number; usable: number; seatHalf: number };
};

const clamp = (lo: number, v: number, hi: number) => Math.round(Math.max(lo, Math.min(hi, v)));

/**
 * Every size on the felt derives from its measured box, so the same table works from a
 * phone on its side to an ultrawide: cards, avatars, and the ellipse the seats sit on.
 * Pure, so the geometry can be checked without a DOM.
 */
export function feltLayout({ felt, statusBelow, hasOpenHands, hasFaceUp }: FeltInput): FeltLayout {
  // Before the first measurement, guess from the window rather than paint a desktop-sized
  // frame on a phone; the bar above the felt is 44px.
  const W = felt.w || (typeof window !== "undefined" ? window.innerWidth : 800);
  const H = felt.h || (typeof window !== "undefined" ? Math.max(200, window.innerHeight - 44) : 500);
  const compact = W < 640 || H < 520;
  const short = H < 400;
  const portrait = H > W;
  // A hand is five cards, so a portrait phone can afford wider ones: easier to read, and
  // a finger lands on the one it meant. Landscape and desktops keep the ratio the ring
  // needs; a short felt trades card size for room, but never below a fingertip's width.
  const cardWidth = short ? clamp(48, Math.min(W / 7, H / 4.5), 150) : clamp(60, Math.min(portrait ? W / 5.2 : W / 7, H / 4.8), 150);
  const avatarSize = short ? clamp(28, H / 9, 64) : clamp(36, H / 10, 64);
  const myBadge = Math.round(Math.max(20, avatarSize * 0.8 * 0.46));
  const handOffset = cardWidth * (short ? 0.3 : compact ? 0.14 : 0.3);
  // On a tall felt the fan may run under the chips at its edges; on a short one nothing
  // else fits in that band, so the whole visible card is reserved.
  const handReserve = short ? cardWidth * 1.42 - handOffset + 2 : cardWidth * 1.42 * 0.8;
  const statusHeight = compact ? 44 : 52;
  // Above the one-line "spectating" / "you sat out" note that owns the very bottom.
  const statusBottom = 34;
  // Cards meant to be read sit above the seat opposite, right where the status card hangs.
  const cardsOnTop = hasOpenHands || hasFaceUp;
  // Half a seat's height (it is centred on its point): a fan of cards above the avatar, a
  // face-up card beside the backs, or just the backs, plus the name and score below. A
  // short seat keeps name and score on one line.
  const seatHalf = short
    ? hasOpenHands
      ? avatarSize * 0.94 + 18
      : hasFaceUp
        ? avatarSize * 0.86 + 18
        : avatarSize * 0.5 + 24
    : hasOpenHands
      ? avatarSize * 0.94 + 27
      : hasFaceUp
        ? avatarSize * 0.86 + 27
        : avatarSize * 0.5 + 39;

  // Keep the ellipse clear of the top bar, the status card, and the hand at the bottom.
  // With readable cards up there the whole ring drops below the status card, so the one
  // card that matters is never hidden under "who is playing". On a short felt the status
  // lives in the bar, so the ring starts right under it.
  const topPad = statusBelow ? seatHalf + 8 : short ? seatHalf + 6 : cardsOnTop ? 8 + statusHeight + 12 + seatHalf : avatarSize * 1.4 + 26;
  const bottomPad = statusBelow ? statusBottom + statusHeight + 6 + seatHalf : handReserve + avatarSize * 0.4;
  const usable = Math.max(short ? 90 : 120, H - topPad - bottomPad);
  const cy = ((topPad + usable / 2) / H) * 100;
  const ry = ((usable / 2) / H) * 100;
  // The side seats back off by a seat's half-width: the avatar, or on a short felt the
  // one-line label, which is wider.
  const rx = Math.min(45, ((W / 2 - Math.max(avatarSize * 1.2, short ? 52 : 0)) / W) * 100);
  const ellipse: Ellipse = { cx: 50, cy, rx, ry };

  // Panels: centred in the ellipse on wide screens; on compact or portrait screens they
  // sit above the hand and the viewer's own chip (which is an avatar tall and hugs the
  // hand), where the side seats cannot be covered. A short felt gives them the whole
  // box above the hand, to scroll in if they must.
  const panelStyle: React.CSSProperties = short
    ? { top: 6, bottom: handReserve + 6, left: 0, right: 0 }
    : compact || portrait
      ? { bottom: handReserve + avatarSize + 20 }
      : { top: `${cy}%`, transform: "translateY(-50%)" };
  // A short ring is a flat one: played cards spread sideways rather than up into the
  // seat opposite.
  const trickSpread: TrickSpread = short ? { x: 0.4, y: 0.2 } : { x: 0.36, y: 0.4 };

  return {
    W,
    H,
    compact,
    short,
    portrait,
    cardWidth,
    avatarSize,
    myBadge,
    handOffset,
    handReserve,
    statusHeight,
    statusBottom,
    ellipse,
    panelStyle,
    trickSpread,
    budget: { topPad, bottomPad, usable, seatHalf },
  };
}

export function useFeltLayout({ felt, statusBelow, hasOpenHands, hasFaceUp }: FeltInput): FeltLayout {
  return useMemo(
    () => feltLayout({ felt: { w: felt.w, h: felt.h }, statusBelow, hasOpenHands, hasFaceUp }),
    [felt.w, felt.h, statusBelow, hasOpenHands, hasFaceUp],
  );
}
