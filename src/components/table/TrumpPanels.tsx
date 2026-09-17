import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { type Card as CardT, SUITS, SUIT_SYMBOLS, type Suit } from "@/engine";
import { CardBack, CardFace } from "./Card";

const SUIT_TEXT: Record<Suit, string> = { H: "text-heart", D: "text-orange-500", C: "text-ink-900", S: "text-ink-900" };

export function TrumpPicker({
  onPick,
  onFlip,
  busy,
  compact = false,
  short = false,
  vote = false,
}: {
  onPick: (s: Suit) => void;
  onFlip: () => void;
  busy: boolean;
  compact?: boolean;
  /** A phone on its side: small boxes, no notes. */
  short?: boolean;
  /** Party "voteTrump": a vote rather than a call, so there is nothing to flip for. */
  vote?: boolean;
}) {
  const { t } = useTranslation();
  const box = short ? "h-14 w-14" : compact ? "h-20 w-20" : "h-28 w-28";
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rounded-3xl border-2 border-gold-400/60 bg-black/80 text-center shadow-2xl backdrop-blur ${short ? "p-3" : compact ? "p-4" : "p-7"}`}
    >
      <p className={`font-display font-extrabold text-cream-50 ${short ? "text-base" : compact ? "text-xl" : "text-3xl"}`}>{vote ? t("table.voteTrump") : t("table.chooseTrump")}</p>
      <div className={`flex justify-center ${short ? "mt-2 gap-2" : compact ? "mt-4 gap-2.5" : "mt-6 gap-4"}`}>
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className={`flex flex-col items-center justify-center rounded-2xl bg-cream-50 shadow-lg transition hover:-translate-y-1.5 hover:bg-white disabled:opacity-50 ${box} ${SUIT_TEXT[s]}`}
            aria-label={t(`suits.${s}`)}
          >
            <span className={`leading-none ${short ? "text-3xl" : compact ? "text-4xl" : "text-6xl"}`}>{SUIT_SYMBOLS[s]}</span>
            {!short && (
              <span className={`mt-1.5 font-semibold uppercase tracking-wider text-ink-500 ${compact ? "text-[10px]" : "text-xs"}`}>
                {t(`suits.${s}`).split(" ")[0]}
              </span>
            )}
          </button>
        ))}
        {!vote && (
          <>
            <span className={`self-center text-cream-100/40 ${compact ? "text-xs" : "text-sm"}`}>{t("table.orFlip")}</span>
            <button
              type="button"
              disabled={busy}
              onClick={onFlip}
              className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gold-400/60 bg-black/40 text-cream-50 transition hover:-translate-y-1.5 hover:border-gold-400 hover:bg-black/60 disabled:opacity-50 ${box}`}
              aria-label={t("table.flip")}
            >
              <CardBack width={short ? 22 : compact ? 30 : 42} />
              <span className={`font-semibold uppercase tracking-wider ${short ? "mt-0.5 text-[9px]" : compact ? "mt-1.5 text-[10px]" : "mt-1.5 text-xs"}`}>
                {t("table.flip")}
              </span>
            </button>
          </>
        )}
      </div>
      <p className={`mx-auto max-w-md text-cream-100/70 ${short ? "mt-2 text-[11px]" : compact ? "mt-3 text-xs" : "mt-5 text-sm"}`}>{vote ? t("table.voteHint") : t("table.flipHint")}</p>
      {!short && (
        <p className={`text-cream-100/50 ${compact ? "mt-1 text-[11px]" : "mt-2 text-xs"}`}>
          {t("table.heartsNote")} · {t("table.clubsNote")}
        </p>
      )}
    </motion.div>
  );
}

/** The trump of the round, large, with the card that flipped it when there was one. */
export function TrumpBig({ trump, flipped, compact = false }: { trump: Suit | null; flipped?: string | null; compact?: boolean }) {
  const { t } = useTranslation();
  const red = trump === "H" || trump === "D";
  return (
    <div className="flex items-center justify-center gap-3">
      {flipped && <CardFace card={flipped as CardT} width={compact ? 34 : 44} title={t("table.flippedCard")} />}
      <span className={`flex items-center justify-center rounded-2xl bg-cream-50 leading-none shadow-lg ${compact ? "h-12 w-12 text-4xl" : "h-16 w-16 text-5xl"} ${red ? "text-heart" : "text-ink-900"}`}>
        {trump ? SUIT_SYMBOLS[trump] : "∅"}
      </span>
      <div className="text-left">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cream-100/60">{t("table.trumpIs")}</p>
        <p className={`font-display font-bold text-cream-50 ${compact ? "text-xl" : "text-2xl"}`}>{trump ? t(`suits.${trump}`).split(" ")[0] : t("table.noTrump")}</p>
        {trump === "H" && <p className="text-xs text-heart">{t("table.heartsNote")}</p>}
        {trump === "C" && <p className="text-xs text-cream-100/80">{t("table.clubsNote")}</p>}
      </div>
    </div>
  );
}

/** Big centre-table reveal when someone names the trump. */
export function TrumpReveal({ trump, byName, flipped, dark, compact = false }: { trump: Suit; byName: string; flipped?: string | null; dark?: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const red = trump === "H" || trump === "D";
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
      animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 1], rotate: [-12, 3, 0] }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ duration: 0.7, times: [0, 0.6, 1] }}
      className={`pointer-events-none flex flex-col items-center rounded-3xl border border-gold-400/50 bg-black/65 text-center shadow-2xl ${compact ? "px-5 py-3" : "px-8 py-5"}`}
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-cream-100/70">
        {dark
          ? t("table.darkCalledBy", { name: byName })
          : flipped
            ? t("table.trumpFlippedBy", { name: byName })
            : t("table.trumpNamedBy", { name: byName })}
      </p>
      {flipped && (
        <motion.div initial={{ rotateY: 180, opacity: 0 }} animate={{ rotateY: 0, opacity: 1 }} transition={{ duration: 0.5 }} className="mt-2">
          <CardFace card={flipped as CardT} width={compact ? 44 : 64} />
        </motion.div>
      )}
      <motion.span
        className={`mt-1 leading-none drop-shadow-[0_0_24px_rgba(232,184,74,0.7)] ${compact ? "text-[3.5rem]" : "text-[6rem]"} ${red ? "text-heart" : "text-cream-50"}`}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      >
        {SUIT_SYMBOLS[trump]}
      </motion.span>
      <p className={`font-display font-extrabold text-cream-50 ${compact ? "text-xl" : "text-3xl"}`}>{t(`suits.${trump}`).split(" ")[0]}</p>
      {dark && <p className="mt-1 rounded bg-heart px-2 py-0.5 text-sm font-extrabold text-white">×4</p>}
      {trump === "H" && !dark && <p className="mt-1 text-sm font-semibold text-heart">{t("table.heartsNote")}</p>}
      {trump === "C" && <p className="mt-1 text-sm font-semibold text-cream-100/90">{t("table.clubsNote")}</p>}
    </motion.div>
  );
}
