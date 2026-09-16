import { useEffect } from "react";

/**
 * Keeps the screen on while `active`: a phone left face up on the table dims and locks
 * mid-round otherwise. The lock drops whenever the page is hidden and is taken again
 * when it comes back, which is how the API works. Silently does nothing where it is
 * unsupported or refused (low battery, for one).
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        lock = null;
      }
    };
    const onVisibility = () => void acquire();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void lock?.release().catch(() => {});
    };
  }, [active]);
}
