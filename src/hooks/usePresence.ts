import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/** Heartbeat so seats can show who is connected. */
export function usePresence(gameId: Id<"games"> | undefined) {
  const heartbeat = useMutation(api.presence.heartbeat);
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const beat = () => {
      if (!cancelled && document.visibilityState === "visible") void heartbeat({ gameId }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 15_000);
    document.addEventListener("visibilitychange", beat);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", beat);
    };
  }, [gameId, heartbeat]);
}
