import type { Card } from "./cards";
import type { RoundState } from "./round";

export type PublicRoundState = Omit<RoundState, "hands" | "drawPile"> & {
  handSizes: number[];
  drawPileSize: number;
};

/** Strip everything secret. Safe to send to any client. */
export function redact(state: RoundState): PublicRoundState {
  const { hands, drawPile, ...rest } = state;
  return { ...rest, handSizes: hands.map((h) => h.length), drawPileSize: drawPile.length };
}

/** Public state plus the viewer's own hand. */
export function viewFor(state: RoundState, seat: number): PublicRoundState & { hand: Card[] } {
  return { ...redact(state), hand: [...(state.hands[seat] ?? [])] };
}
