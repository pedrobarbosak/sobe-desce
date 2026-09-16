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
    let lastBeat = 0;
    const beat = () => {
      if (cancelled) return;
      lastBeat = Date.now();
      void heartbeat({ gameId }).catch(() => {});
    };
    beat();
    const id = setInterval(beat, 15_000);
    // Waking up from a locked phone or a background tab: report in straight away. Tabbing
    // back and forth fires these several times a second, and the server would ignore all
    // but the first anyway, so the rest are not sent.
    const wake = () => {
      if (Date.now() - lastBeat >= 5_000) beat();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", wake);
    window.addEventListener("pageshow", wake);
    window.addEventListener("online", wake);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", wake);
      window.removeEventListener("pageshow", wake);
      window.removeEventListener("online", wake);
    };
  }, [gameId, heartbeat]);
}
