import { useEffect, useRef } from "react";
import { sound } from "@/lib/sound";
import type { Reveal } from "./useReveals";

type Input = {
  roundId: string | undefined;
  /** Cards on the felt in the trick being played. */
  playCount: number;
  /** Tricks finished so far this round. */
  trickCount: number;
  /** The trick that just finished: who was in it and who took it. */
  lastTrick: { plays: { seat: number }[]; winner: number } | undefined;
  mySeat: number;
  phase: string | undefined;
  winnerSeat: number | null;
  /** The finished trick is still being shown: the round's cue waits for it, like the result card. */
  holding: boolean;
  reveal: Reveal | null;
  /** The viewer's own deadline while it is their turn, else null. */
  myDeadline: number | null;
  totalTurnMs: number;
  skewMs: number;
};

/** Every sound the table makes, each derived from a change in what the server sent. */
export function useTableSounds({ roundId, playCount, trickCount, lastTrick, mySeat, phase, winnerSeat, holding, reveal, myDeadline, totalTurnMs, skewMs }: Input): void {
  // A card landing, and a trick going to someone.
  const lastPlays = useRef({ roundId, playCount, trickCount });
  useEffect(() => {
    const prev = lastPlays.current;
    lastPlays.current = { roundId, playCount, trickCount };
    if (prev.roundId !== roundId) return;
    if (playCount > prev.playCount || trickCount > prev.trickCount) sound.play("card");
    if (trickCount > prev.trickCount) {
      const inTrick = lastTrick?.plays.some((p) => p.seat === mySeat) ?? false;
      const cue = !inTrick ? "trick" : lastTrick?.winner === mySeat ? "trickWin" : "trickLose";
      setTimeout(() => sound.play(cue), 250);
    }
  }, [roundId, playCount, trickCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // The round's verdict.
  useEffect(() => {
    if (phase !== "scored" || holding) return;
    if (winnerSeat === null) sound.play("round");
    else sound.play(winnerSeat === mySeat ? "win" : "lose");
  }, [phase, winnerSeat, holding, roundId, mySeat]);

  // Something announced in the middle of the felt.
  useEffect(() => {
    if (reveal) sound.play(reveal.kind === "coin" ? "card" : "trump");
  }, [reveal]);

  // The viewer's own clock. The seconds live in the status card; this only makes it audible:
  // silent for the first stretch, then faster and sharper the less time is left.
  useEffect(() => {
    if (!myDeadline) return;
    sound.play("turn");
    const remaining = () => Math.max(0, myDeadline - (Date.now() + skewMs));
    let cancelled = false;
    let tickId: number | undefined;
    const schedule = () => {
      const left = remaining();
      if (cancelled || left <= 0) return;
      const frac = left / totalTurnMs;
      const delay = frac > 0.5 ? left - totalTurnMs * 0.5 : left > 10_000 ? 2000 : left > 5_000 ? 1000 : left > 2_000 ? 500 : 250;
      tickId = window.setTimeout(() => {
        if (cancelled) return;
        const now = remaining();
        if (now < left - 1) sound.play("tick", Math.min(1, Math.max(0, 1 - now / Math.min(totalTurnMs, 15_000))));
        schedule();
      }, Math.max(60, delay));
    };
    schedule();
    return () => {
      cancelled = true;
      if (tickId) clearTimeout(tickId);
    };
  }, [myDeadline, totalTurnMs, skewMs]);
}
