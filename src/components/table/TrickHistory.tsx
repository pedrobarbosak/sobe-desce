import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { type Card as CardT, SUIT_SYMBOLS, rankOf, suitOf } from "@/engine";
import type { SeatView } from "./Seat";

const SUIT_TEXT: Record<string, string> = { H: "text-heart", D: "text-orange-600", C: "text-ink-900", S: "text-ink-900" };

export type PlayedTrick = { leader: number; plays: { seat: number; card: string }[]; winner: number };

function Chip({ card, won }: { card: string; won: boolean }) {
  const suit = suitOf(card as CardT);
  return (
    <span
      className={`inline-flex items-center rounded px-1 font-mono text-[11px] font-bold leading-5 ${SUIT_TEXT[suit]} ${
        won ? "bg-gold-400 ring-1 ring-gold-200" : "bg-cream-50/85"
      }`}
    >
      {rankOf(card as CardT)}
      {SUIT_SYMBOLS[suit]}
    </span>
  );
}

/**
 * What has already been played this round. People forget which high cards are gone, and
 * the trick area only ever shows the current one, so it lives beside the felt.
 */
export function TrickHistory({ tricks, seats, compact }: { tricks: PlayedTrick[]; seats: SeatView[]; compact?: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(!compact);
  if (tricks.length === 0) return null;
  // A trick collected face down (party "fog") has no name to show until the round is scored.
  const nameOf = (seat: number) => (seat < 0 ? "?" : seats[seat]?.isMe ? t("common.you") : seats[seat]?.name ?? "");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-xl bg-black/50 px-2.5 py-1.5 text-xs font-semibold text-cream-100/80 backdrop-blur hover:bg-black/70"
      >
        {t("table.showTricks")} <span className="ml-1 rounded bg-gold-400 px-1 text-ink-900">{tricks.length}</span>
      </button>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} className="rounded-xl bg-black/50 p-2 backdrop-blur">
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cream-100/50">{t("table.trickHistory")}</p>
        {compact && (
          <button type="button" onClick={() => setOpen(false)} className="text-[10px] text-cream-100/60 hover:text-cream-50">
            {t("table.hideTricks")}
          </button>
        )}
      </div>
      <ol className="space-y-1">
        {tricks.map((trick, i) => (
          <li key={i} className="flex items-center gap-1.5" title={t("table.trickN", { n: i + 1 })}>
            <span className="w-3 shrink-0 text-right font-mono text-[10px] text-cream-100/40">{i + 1}</span>
            <span className="flex flex-wrap gap-0.5">
              {trick.plays.map((play) => (
                <Chip key={`${play.seat}-${play.card}`} card={play.card} won={play.seat === trick.winner} />
              ))}
            </span>
            <span className="ml-0.5 max-w-[5.5rem] truncate text-[10px] text-gold-400">{nameOf(trick.winner)}</span>
          </li>
        ))}
      </ol>
    </motion.div>
  );
}
