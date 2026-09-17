import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { SUIT_SYMBOLS } from "@/engine";
import { Button } from "@/components/ui/Button";
import { CardBack } from "./Card";

/**
 * The blind window. Shown only to the seat that settles the trump, and only while the
 * server is still withholding their cards, so the offer is genuinely made in the dark.
 */
export function DarkCall({
  deadline,
  skewMs,
  busy,
  onCall,
  onSkip,
  compact = false,
  short = false,
}: {
  deadline: number;
  skewMs: number;
  busy: boolean;
  onCall: () => void;
  onSkip: () => void;
  compact?: boolean;
  /** A phone on its side: the box above the hand is about 180px tall. */
  short?: boolean;
}) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(() => Math.max(0, Math.ceil((deadline - (Date.now() + skewMs)) / 1000)));
  // Measured once, off the render path: the countdown above re-renders every second, and
  // recomputing this duration each time restarted the bar instead of letting it drain.
  const [barSeconds, setBarSeconds] = useState<number | null>(null);
  useEffect(() => {
    setBarSeconds(Math.max(0, (deadline - (Date.now() + skewMs)) / 1000));
  }, [deadline, skewMs]);

  useEffect(() => {
    const read = () => setLeft(Math.max(0, Math.ceil((deadline - (Date.now() + skewMs)) / 1000)));
    read();
    const id = setInterval(read, 200);
    return () => clearInterval(id);
  }, [deadline, skewMs]);

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rounded-3xl border-2 border-heart/70 bg-black/85 text-center shadow-2xl backdrop-blur short:bg-black/95 ${short ? "p-3" : compact ? "p-4" : "p-6"}`}
    >
      {!short && (
        <div className="flex items-center justify-center gap-3">
          {[0, 1, 2].map((i) => (
            <CardBack key={i} width={compact ? 30 : 40} style={{ transform: `rotate(${(i - 1) * 7}deg)` }} />
          ))}
        </div>
      )}
      <p className={`font-display font-extrabold text-cream-50 ${short ? "text-base" : compact ? "mt-3 text-xl" : "mt-3 text-3xl"}`}>
        <span className="text-heart">{SUIT_SYMBOLS.H}</span> {t("table.darkTitle")}
      </p>
      <p className={`mx-auto max-w-sm text-cream-100/80 ${short ? "mt-1 text-[11px]" : compact ? "mt-2 text-xs" : "mt-2 text-sm"}`}>{t("table.darkHint")}</p>
      <div className={`flex flex-wrap items-center justify-center gap-2 ${short ? "mt-2" : "mt-4"}`}>
        <Button variant="danger" disabled={busy || left <= 0} onClick={onCall} className={compact ? "" : "px-6 py-3 text-base"}>
          {t("table.darkHearts")} <span className="ml-1 rounded bg-black/30 px-1.5 font-mono">×4</span>
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onSkip}>
          {t("table.darkSkip")}
        </Button>
      </div>
      <div className={short ? "mt-2" : "mt-3"}>
        <p className="text-xs text-cream-100/60">{t("table.darkWait", { s: left })}</p>
        <div className="mx-auto mt-1.5 h-1 w-40 overflow-hidden rounded-full bg-white/15">
          {barSeconds !== null && (
            <motion.div
              className="h-full bg-heart"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: barSeconds, ease: "linear" }}
            />
          )}
        </div>
      </div>
    </motion.div>
  );
}
