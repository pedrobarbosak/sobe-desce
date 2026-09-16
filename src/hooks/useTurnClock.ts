import { useEffect, useState } from "react";

type Input = {
  roundId: string | undefined;
  turnNonce: number | undefined;
  turnDeadline: number | null | undefined;
  /** The full length of a turn on this table, or this round's shorter one. */
  totalTurnMs: number;
};

/**
 * Clock skew between server and client, anchored on the turn deadline: it is written by
 * the server the instant a turn starts and reaches us within network latency. (A "server
 * now" on the query would go stale, since queries only re-run on data changes.)
 *
 * Read once when the turn starts, never during render. `turnBarMs` has to be frozen for
 * the turn as well as measured once: the progress bar is a CSS animation, and patching its
 * duration mid-flight does not restart it. The browser keeps the elapsed time and simply
 * rescales, so a re-render part way through a turn made the bar jump forward. Holding the
 * value steady leaves the animation alone; keying the bar on the turn restarts it.
 */
export function useTurnClock({ roundId, turnNonce, turnDeadline, totalTurnMs }: Input): { skewMs: number; turnBarMs: number } {
  const turnKey = turnDeadline ? `${roundId}:${turnNonce}` : null;
  const [clock, setClock] = useState<{ key: string; skewMs: number; barMs: number } | null>(null);
  useEffect(() => {
    if (!turnKey || !turnDeadline) return;
    const now = Date.now();
    setClock({ key: turnKey, skewMs: turnDeadline - totalTurnMs - now, barMs: Math.max(0, turnDeadline - now) });
  }, [turnKey, totalTurnMs, turnDeadline]);
  return {
    skewMs: clock?.skewMs ?? 0,
    turnBarMs: clock?.key === turnKey ? clock.barMs : totalTurnMs,
  };
}
