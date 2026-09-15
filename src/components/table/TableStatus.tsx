import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";
import { TimerRing } from "./TimerRing";
import type { SeatView } from "./Seat";

type Props = {
  /** Seat on turn, or the trick winner while the table holds a finished trick. */
  actor: SeatView | undefined;
  kind: "trump" | "discard" | "pass" | "tricks" | "trickWon" | null;
  isMe: boolean;
  deadline: number | null;
  totalMs: number;
  skewMs: number;
  compact?: boolean;
};

/**
 * The "who is doing what" card, parked over the middle of the felt where players are
 * already looking. It replaces the line that used to sit in the top bar, out of sight.
 */
export function TableStatus({ actor, kind, isMe, deadline, totalMs, skewMs, compact }: Props) {
  const { t } = useTranslation();
  const secondsLeft = useCountdown(isMe ? deadline : null, skewMs);
  if (!actor || !kind) return null;
  const urgent = isMe && secondsLeft !== null && secondsLeft <= 10;
  const size = compact ? 30 : 38;
  const what =
    kind === "trickWon"
      ? t("table.trickWon", { name: actor.name })
      : isMe
        ? t("table.yourTurnNow")
        : kind === "trump"
          ? t("table.choosingTrump", { name: actor.name })
          : kind === "discard"
            ? t("table.deciding", { name: actor.name })
            : kind === "pass"
              ? t("table.passing", { name: actor.name })
              : t("table.waitingFor", { name: actor.name });

  return (
    <motion.div
      key={`${actor.seat}-${kind}`}
      initial={{ y: -14, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`pointer-events-none flex items-center gap-2.5 rounded-full border py-1.5 pl-1.5 shadow-xl backdrop-blur ${
        compact ? "pr-3 text-sm" : "pr-4 text-base"
      } ${
        kind === "trickWon"
          ? "border-gold-400/60 bg-black/70"
          : isMe
            ? `border-gold-400 bg-gold-400/25 ${urgent ? "turn-pulse" : ""}`
            : "border-white/15 bg-black/60"
      }`}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Avatar seed={actor.avatarSeed} size={size} />
        {kind !== "trickWon" && deadline && <TimerRing deadline={deadline} totalMs={totalMs} size={size} skewMs={skewMs} />}
      </div>
      <span className={`whitespace-nowrap font-semibold ${isMe || kind === "trickWon" ? "text-gold-400" : "text-cream-50"}`}>{what}</span>
      {isMe && secondsLeft !== null && (
        <span className={`rounded-md px-1.5 py-0.5 font-mono text-xs ${urgent ? "bg-heart text-white" : "bg-gold-400 text-ink-900"}`}>
          {t("table.timeLeft", { s: secondsLeft })}
        </span>
      )}
    </motion.div>
  );
}

/** Local to the status card: the whole table used to re-render on every tick. */
function useCountdown(deadline: number | null, skewMs: number): number | null {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!deadline) {
      setLeft(null);
      return;
    }
    const read = () => setLeft(Math.max(0, Math.ceil((deadline - (Date.now() + skewMs)) / 1000)));
    read();
    const id = setInterval(read, 250);
    return () => clearInterval(id);
  }, [deadline, skewMs]);
  return left;
}
