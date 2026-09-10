import { useEffect, useState } from "react";
import type { Card, CompletedTrick, TrickInProgress } from "@/engine";

type Round = { _id: string; currentTrick: TrickInProgress; completedTricks: CompletedTrick[] } | null;
type Held = { trick: CompletedTrick; collecting: boolean } | null;

/**
 * The server resolves a trick the instant the last card lands, so the client keeps the
 * finished trick on the table for a beat (`holding`), then sweeps it to the winner
 * (`collecting`) before showing the next trick.
 *
 * The hold is derived synchronously during render (not in an effect) so there is never an
 * intermediate frame with an empty table, which would remount the cards and make them flash.
 */
export function useTrickDisplay(round: Round, holdMs = 1300, collectMs = 550) {
  const roundId = round?._id ?? null;
  const count = round?.completedTricks.length ?? 0;
  const [tracked, setTracked] = useState({ roundId, count });
  const [held, setHeld] = useState<Held>(null);

  if (roundId !== tracked.roundId || count !== tracked.count) {
    setTracked({ roundId, count });
    const last = round?.completedTricks[count - 1];
    if (roundId !== null && roundId === tracked.roundId && count > tracked.count && last) {
      setHeld({ trick: last, collecting: false });
    } else {
      setHeld(null);
    }
  }

  const heldTrick = held?.trick ?? null;
  useEffect(() => {
    if (!heldTrick) return;
    const a = setTimeout(() => setHeld({ trick: heldTrick, collecting: true }), holdMs);
    const b = setTimeout(() => setHeld(null), holdMs + collectMs);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [heldTrick, holdMs, collectMs]);

  if (held) {
    return {
      plays: held.trick.plays as { seat: number; card: Card }[],
      winnerSeat: held.trick.winner,
      holding: true,
      collecting: held.collecting,
    };
  }
  return {
    plays: (round?.currentTrick.plays ?? []) as { seat: number; card: Card }[],
    winnerSeat: null as number | null,
    holding: false,
    collecting: false,
  };
}
