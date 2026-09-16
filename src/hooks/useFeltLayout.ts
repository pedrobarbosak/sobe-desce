import { useMemo } from "react";
import type { Ellipse } from "@/components/table/geometry";

type Input = {
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
  portrait: boolean;
  cardWidth: number;
  avatarSize: number;
  /** The badges on the viewer's own chip, which uses a smaller avatar. */
  myBadge: number;
  handHeight: number;
  statusHeight: number;
  /** Where the status card sits when it is along the bottom edge. */
  statusBottom: number;
  ellipse: Ellipse;
  /** Where the trump, discard and party panels go. */
  panelStyle: React.CSSProperties;
};

/**
 * Every size on the felt derives from its measured box, so the same table works from a
 * phone to an ultrawide: cards, avatars, and the ellipse the seats sit on.
 */
export function useFeltLayout({ felt, statusBelow, hasOpenHands, hasFaceUp }: Input): FeltLayout {
  const W = felt.w || 800;
  const H = felt.h || 500;
  const compact = W < 640 || H < 520;
  const portrait = H > W;
  const cardWidth = Math.round(Math.max(60, Math.min(150, W / 7, H / 4.8)));
  const avatarSize = Math.round(Math.max(36, Math.min(64, H / 10)));
  const myBadge = Math.round(Math.max(20, avatarSize * 0.8 * 0.46));
  const handHeight = cardWidth * 1.42 * 0.8;
  const statusHeight = compact ? 44 : 52;
  // Above the one-line "spectating" / "you sat out" note that owns the very bottom.
  const statusBottom = 34;
  // Cards meant to be read sit above the seat opposite, right where the status card hangs.
  const cardsOnTop = hasOpenHands || hasFaceUp;
  // Half a seat's height (it is centred on its point): a fan of cards above the avatar, a
  // face-up card beside the backs, or just the backs, plus the name and score below.
  const seatHalf = hasOpenHands ? avatarSize * 0.94 + 27 : hasFaceUp ? avatarSize * 0.86 + 27 : avatarSize * 0.5 + 39;

  // Keep the ellipse clear of the top bar, the status card, and the hand at the bottom.
  const ellipse: Ellipse = useMemo(() => {
    // With readable cards up there the whole ring drops below the status card, so the
    // one card that matters is never hidden under "who is playing".
    const topPad = statusBelow ? seatHalf + 8 : cardsOnTop ? 8 + statusHeight + 12 + seatHalf : avatarSize * 1.4 + 26;
    const bottomPad = statusBelow ? statusBottom + statusHeight + 6 + seatHalf : handHeight + avatarSize * 0.4;
    const usable = Math.max(120, H - topPad - bottomPad);
    const cy = ((topPad + usable / 2) / H) * 100;
    const ry = ((usable / 2) / H) * 100;
    const rx = Math.min(45, ((W / 2 - avatarSize * 1.2) / W) * 100);
    return { cx: 50, cy, rx, ry };
  }, [W, H, avatarSize, handHeight, statusBelow, statusHeight, statusBottom, seatHalf, cardsOnTop]);

  // Panels: centred in the ellipse on wide screens; on compact or portrait screens they
  // sit just above the hand, where the side seats cannot be covered.
  const panelStyle: React.CSSProperties =
    compact || portrait ? { bottom: handHeight + avatarSize * 0.35 } : { top: `${ellipse.cy}%`, transform: "translateY(-50%)" };

  return { W, H, compact, portrait, cardWidth, avatarSize, myBadge, handHeight, statusHeight, statusBottom, ellipse, panelStyle };
}
