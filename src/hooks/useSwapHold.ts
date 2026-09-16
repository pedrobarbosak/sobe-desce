import { useEffect, useRef, useState } from "react";
import { COIN_FLIGHT_MS } from "@/components/table/PartyReveals";
import type { Reveal } from "./useReveals";

type Held = { roundId: string; hand: string[] };

/** If the coin never gets its moment (a reload, a reveal that never comes), let go anyway. */
const HOLD_LIMIT_MS = 8_000;
/** After the coin has landed, a beat to read it before the cards change. */
const AFTER_LANDING_MS = 350;

/**
 * Party "swap": the server moves the hands in the same update that ends the deciding, so
 * the new cards would appear while the coin is still in the air. The hand from before the
 * toss stays on screen until the coin has landed, and only then does the new one deal in.
 * While held, the hand cannot be played from: it is not the hand the server has for us.
 */
export function useSwapHold(
  hand: string[] | null,
  roundId: string | undefined,
  phase: string | undefined,
  swapped: boolean | null,
  reveal: Reveal | null,
): { hand: string[] | null; holding: boolean } {
  // The hand as it stood during the deciding, in case it is about to move.
  const before = useRef<Held | null>(null);
  useEffect(() => {
    if (phase === "discard" && roundId && hand) before.current = { roundId, hand };
  }, [phase, roundId, hand]);

  const [held, setHeld] = useState<Held | null>(null);
  // The hands moved: hold on to the old one.
  const seen = useRef<{ roundId: string | undefined; phase: string | undefined }>({ roundId: undefined, phase: undefined });
  useEffect(() => {
    const prev = seen.current;
    seen.current = { roundId, phase };
    if (!roundId || prev.roundId !== roundId || prev.phase !== "discard" || phase === "discard") return;
    const b = before.current;
    if (swapped && b && b.roundId === roundId) setHeld(b);
  }, [roundId, phase, swapped]);

  // Let go once the coin has landed, or when it is clear no coin is coming.
  const coin = reveal?.kind === "coin" ? reveal : null;
  useEffect(() => {
    if (!held) return;
    const wait = coin && coin.roundId === held.roundId ? COIN_FLIGHT_MS + AFTER_LANDING_MS : HOLD_LIMIT_MS;
    const id = setTimeout(() => setHeld(null), wait);
    return () => clearTimeout(id);
  }, [held, coin]);

  const holding = held !== null && held.roundId === roundId;
  return { hand: holding ? held.hand : hand, holding };
}
