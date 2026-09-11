import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

/**
 * Heartbeat so seats can show who is connected, and so a seat handed to a bot while the
 * tab was away comes back the moment it returns. A tab in the background still counts as
 * here: browsers slow its timers down but the person has not left, and a closed tab
 * stops beating on its own.
 */
export function usePresence(gameId: Id<"games"> | undefined) {
  const heartbeat = useMutation(api.presence.heartbeat);
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    const beat = () => {
      if (!cancelled) void heartbeat({ gameId }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 15_000);
    // Waking up from a locked phone or a background tab: report in straight away.
    const onVisible = () => {
      if (document.visibilityState === "visible") beat();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", beat);
    window.addEventListener("pageshow", beat);
    window.addEventListener("online", beat);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", beat);
      window.removeEventListener("pageshow", beat);
      window.removeEventListener("online", beat);
    };
  }, [gameId, heartbeat]);
}
