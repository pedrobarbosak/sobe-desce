import { useCallback, useEffect, useRef, useState } from "react";
import type { Suit } from "@/engine";

/** The announcements that take the middle of the felt for a beat, one at a time. */
export type Reveal =
  | { kind: "twist"; roundId: string }
  | { kind: "trump"; suit: Suit; roundId: string }
  | { kind: "coin"; roundId: string; swapped: boolean };

/** How long each one holds. The coin needs its flight, then a moment to read the verdict. */
const REVEAL_MS: Record<Reveal["kind"], number> = { twist: 2800, trump: 2600, coin: 3600 };

type Input = {
  roundId: string | undefined;
  roundPhase: string | undefined;
  /** The round has been dealt and nobody has acted on it yet. */
  roundOpening: boolean;
  trump: string | null;
  /** The seat that settles the trump. They saw it coming; everyone else gets the reveal. */
  namerSeat: number;
  mySeat: number;
  /** A trump that came off the stock is news to the flipper too. */
  flipped: string | null;
  /** Party: the round's twist, or null on a classic table. */
  twist: string | null;
  /** Party "swap": which way the coin fell, once it has been tossed. */
  swapped: boolean | null;
};

/**
 * The centre-felt announcements, queued rather than fighting for the spot: the twist as
 * the round is dealt, the trump as it is named, the swap coin as it is tossed. Each holds
 * for its own beat; the head of the queue is what the table shows.
 */
export function useReveals({ roundId, roundPhase, roundOpening, trump, namerSeat, mySeat, flipped, twist, swapped }: Input): Reveal | null {
  const [reveals, setReveals] = useState<Reveal[]>([]);
  const reveal = reveals[0] ?? null;
  const announce = useCallback((r: Reveal) => setReveals((q) => [...q, r]), []);

  // Big reveal when the trump gets named by someone else.
  const seenTrump = useRef<{ roundId: string | undefined; trump: string | null }>({ roundId: undefined, trump: null });
  useEffect(() => {
    const prev = seenTrump.current;
    seenTrump.current = { roundId, trump };
    if (!roundId || !trump) return;
    if (prev.roundId === roundId && prev.trump === null && (namerSeat !== mySeat || flipped !== null)) {
      announce({ kind: "trump", suit: trump as Suit, roundId });
    }
  }, [roundId, trump, namerSeat, mySeat, flipped, announce]);

  // The twist goes up as the round is dealt: once per round, and only while the round is
  // still opening. Someone arriving mid-round has the banner in the corner instead.
  const seenTwist = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!roundId || !twist || !roundOpening || seenTwist.current === roundId) return;
    seenTwist.current = roundId;
    // A fresh round makes anything still queued from the last one stale.
    setReveals((q) => [...q.filter((r) => r.roundId === roundId), { kind: "twist", roundId }]);
  }, [roundId, twist, roundOpening]);

  // Party "swap": the coin is tossed the moment the deciding ends, and the server says
  // which way it fell in the same update that moves the round on.
  const seenPhase = useRef<{ roundId: string | undefined; phase: string | undefined }>({ roundId: undefined, phase: undefined });
  useEffect(() => {
    const prev = seenPhase.current;
    seenPhase.current = { roundId, phase: roundPhase };
    if (!roundId || prev.roundId !== roundId || swapped === null) return;
    if (prev.phase === "discard" && roundPhase !== "discard" && roundPhase !== "scored") announce({ kind: "coin", roundId, swapped });
  }, [roundId, roundPhase, swapped, announce]);

  // Clearing is its own effect: hanging it off the ones above meant a re-run could cancel
  // the timer without re-arming it, leaving the reveal parked over the discard panel.
  useEffect(() => {
    if (!reveal) return;
    const id = setTimeout(() => setReveals((q) => q.slice(1)), REVEAL_MS[reveal.kind]);
    return () => clearTimeout(id);
  }, [reveal]);

  return reveal;
}
