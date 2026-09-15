import type { Card } from "./cards";
import { type PublicPartyState, redactParty, visibleHands } from "./party";
import type { RoundState } from "./round";

export type PublicRoundState = Omit<RoundState, "hands" | "drawPile" | "party"> & {
  handSizes: number[];
  drawPileSize: number;
  party: PublicPartyState | null;
};

/** Strip everything secret. Safe to send to any client. */
export function redact(state: RoundState): PublicRoundState {
  const { hands, drawPile, party, ...rest } = state;
  return {
    ...rest,
    handSizes: hands.map((h) => h.length),
    drawPileSize: drawPile.length,
    party: party ? redactParty(party) : null,
  };
}

export type SeatView = PublicRoundState & {
  hand: Card[];
  /** Party: this seat's unused powerups. */
  inventory: string[];
  /** Party: other hands this seat may see, through a peek or as a guardian. */
  peeked: { seat: number; cards: Card[] }[];
};

/** Public state plus what this one seat is entitled to see. */
export function viewFor(state: RoundState, seat: number): SeatView {
  return {
    ...redact(state),
    hand: [...(state.hands[seat] ?? [])],
    inventory: [...(state.party?.inventory[seat] ?? [])],
    peeked: state.party ? visibleHands(state.party, seat, state.hands) : [],
  };
}
