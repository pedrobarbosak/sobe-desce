import { motion } from "motion/react";
import type { Card as CardT } from "@/engine";
import { CardFace } from "./Card";
import type { ringPlacer } from "./geometry";

export type DisplayPlay = { seat: number; card: CardT };

type Props = {
  plays: DisplayPlay[];
  /** Seat currently winning the trick (live) or the winner of a held trick. */
  leadingSeat: number | null;
  /** True while a finished trick is shown before it is collected. */
  holding: boolean;
  collecting: boolean;
  placer: ReturnType<typeof ringPlacer>;
  cardWidth: number;
};

/**
 * Cards fly in from their seat to a slot near the centre. When a trick is being
 * collected they all sweep to the winner and fade; the next render simply drops them.
 */
export function TrickArea({ plays, leadingSeat, holding, collecting, placer, cardWidth }: Props) {
  const winnerPos = leadingSeat !== null && collecting ? placer.seat(leadingSeat) : null;
  return (
    <div className="pointer-events-none absolute inset-0">
      {plays.map((p) => {
        const slot = placer.slot(p.seat);
        const from = placer.seat(p.seat);
        const isLeading = leadingSeat === p.seat;
        const target = winnerPos
          ? { left: `${winnerPos.x}%`, top: `${winnerPos.y}%`, opacity: 0, scale: 0.4, rotate: slot.rotate }
          : {
              left: `${slot.x}%`,
              top: `${slot.y}%`,
              opacity: 1,
              scale: holding && isLeading ? 1.18 : 1,
              rotate: slot.rotate,
            };
        return (
          <motion.div
            key={p.card}
            className="absolute"
            style={{ zIndex: isLeading ? 12 : 10, x: "-50%", y: "-50%" }}
            initial={{ left: `${from.x}%`, top: `${from.y}%`, opacity: 0, rotate: slot.rotate + 20, scale: 0.6 }}
            animate={target}
            transition={collecting ? { duration: 0.45, ease: "easeIn" } : { type: "spring", stiffness: 260, damping: 24 }}
          >
            <div className={`relative rounded-[10px] ${isLeading && !collecting ? (holding ? "winning-card" : "leading-card") : ""}`}>
              <CardFace card={p.card} width={cardWidth} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
