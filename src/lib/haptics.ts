import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

/**
 * A nudge from the phone for the two moments a player looking elsewhere needs to feel:
 * it is their turn, and the trick was theirs. Falls back to the vibration API in a mobile
 * browser and does nothing on a desktop, which has no motor.
 */
export function buzz(kind: "turn" | "win"): void {
  const call =
    kind === "turn" ? Haptics.impact({ style: ImpactStyle.Medium }) : Haptics.notification({ type: NotificationType.Success });
  void call.catch(() => {});
}
