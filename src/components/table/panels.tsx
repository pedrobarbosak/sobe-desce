import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { type Card as CardT, SUITS, SUIT_SYMBOLS, type Suit, type SitOutBlock } from "@/engine";
import { Button } from "@/components/ui/Button";
import { CardBack, CardFace } from "./Card";
import type { SeatView } from "./Seat";

const SUIT_TEXT: Record<Suit, string> = { H: "text-heart", D: "text-orange-500", C: "text-ink-900", S: "text-ink-900" };

export function TrumpPicker({
  onPick,
  onFlip,
  busy,
  compact = false,
}: {
  onPick: (s: Suit) => void;
  onFlip: () => void;
  busy: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const box = compact ? "h-20 w-20" : "h-28 w-28";
  return (
    <motion.div
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`rounded-3xl border-2 border-gold-400/60 bg-black/80 text-center shadow-2xl backdrop-blur ${compact ? "p-4" : "p-7"}`}
    >
      <p className={`font-display font-extrabold text-cream-50 ${compact ? "text-xl" : "text-3xl"}`}>{t("table.chooseTrump")}</p>
      <div className={`flex justify-center ${compact ? "mt-4 gap-2.5" : "mt-6 gap-4"}`}>
        {SUITS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={busy}
            onClick={() => onPick(s)}
            className={`flex flex-col items-center justify-center rounded-2xl bg-cream-50 shadow-lg transition hover:-translate-y-1.5 hover:bg-white disabled:opacity-50 ${box} ${SUIT_TEXT[s]}`}
            aria-label={t(`suits.${s}`)}
          >
            <span className={`leading-none ${compact ? "text-4xl" : "text-6xl"}`}>{SUIT_SYMBOLS[s]}</span>
            <span className={`mt-1.5 font-semibold uppercase tracking-wider text-ink-500 ${compact ? "text-[10px]" : "text-xs"}`}>
              {t(`suits.${s}`).split(" ")[0]}
            </span>
          </button>
        ))}
        <span className={`self-center text-cream-100/40 ${compact ? "text-xs" : "text-sm"}`}>{t("table.orFlip")}</span>
        <button
          type="button"
          disabled={busy}
          onClick={onFlip}
          className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gold-400/60 bg-black/40 text-cream-50 transition hover:-translate-y-1.5 hover:border-gold-400 hover:bg-black/60 disabled:opacity-50 ${box}`}
          aria-label={t("table.flip")}
        >
          <CardBack width={compact ? 30 : 42} />
          <span className={`mt-1.5 font-semibold uppercase tracking-wider ${compact ? "text-[10px]" : "text-xs"}`}>
            {t("table.flip")}
          </span>
        </button>
      </div>
      <p className={`mx-auto max-w-md text-cream-100/70 ${compact ? "mt-3 text-xs" : "mt-5 text-sm"}`}>{t("table.flipHint")}</p>
      <p className={`text-cream-100/50 ${compact ? "mt-1 text-[11px]" : "mt-2 text-xs"}`}>
        {t("table.heartsNote")} · {t("table.clubsNote")}
      </p>
    </motion.div>
  );
}

export function TrumpBig({ trump, flipped, compact = false }: { trump: Suit; flipped?: string | null; compact?: boolean }) {
  const { t } = useTranslation();
  const red = trump === "H" || trump === "D";
  return (
    <div className="flex items-center justify-center gap-3">
      {flipped && <CardFace card={flipped as CardT} width={compact ? 34 : 44} title={t("table.flippedCard")} />}
      <span className={`flex items-center justify-center rounded-2xl bg-cream-50 leading-none shadow-lg ${compact ? "h-12 w-12 text-4xl" : "h-16 w-16 text-5xl"} ${red ? "text-heart" : "text-ink-900"}`}>
        {SUIT_SYMBOLS[trump]}
      </span>
      <div className="text-left">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-cream-100/60">{t("table.trumpIs")}</p>
        <p className={`font-display font-bold text-cream-50 ${compact ? "text-xl" : "text-2xl"}`}>{t(`suits.${trump}`).split(" ")[0]}</p>
        {trump === "H" && <p className="text-xs text-heart">{t("table.heartsNote")}</p>}
        {trump === "C" && <p className="text-xs text-cream-100/80">{t("table.clubsNote")}</p>}
      </div>
    </div>
  );
}

export type PendingChoice = { kind: "discard"; cards: string[] } | { kind: "sitOut" };

export function DiscardPanel({
  cap,
  trump,
  flipped,
  youFlipped = false,
  selectedCount,
  sitOutBlock,
  threshold,
  busy,
  onDiscard,
  onSitOut,
  compact = false,
  prepare = false,
  pending = null,
  onClear,
}: {
  cap: number;
  trump: Suit;
  flipped?: string | null;
  /** The viewer flipped for the trump, so the round has not committed them. */
  youFlipped?: boolean;
  compact?: boolean;
  selectedCount: number;
  sitOutBlock: SitOutBlock | null;
  threshold: number;
  busy: boolean;
  onDiscard: () => void;
  onSitOut: () => void;
  /** True while it is somebody else's turn: the choice is stored and replayed later. */
  prepare?: boolean;
  pending?: PendingChoice | null;
  onClear?: () => void;
}) {
  const { t } = useTranslation();
  const box = `rounded-2xl border bg-black/70 text-center backdrop-blur ${compact ? "p-3" : "p-4"} ${
    prepare ? "border-white/20" : "border-gold-400/50"
  }`;

  if (prepare && pending) {
    return (
      <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={box}>
        <p className="text-xs font-semibold uppercase tracking-wider text-gold-400">{t("table.readyNext")}</p>
        <p className={`mt-1 font-display font-bold text-cream-50 ${compact ? "text-base" : "text-lg"}`}>
          {pending.kind === "sitOut"
            ? t("table.readySitOut")
            : pending.cards.length === 0
              ? t("table.readyKeepAll")
              : t("table.readyDiscardN", { count: pending.cards.length })}
        </p>
        <p className="mt-1 text-xs text-cream-100/60">{t("table.readyHint")}</p>
        <div className="mt-3">
          <Button variant="ghost" onClick={onClear}>
            {t("table.changeChoice")}
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className={box}>
      {prepare ? (
        <p className={`font-display font-bold text-cream-50 ${compact ? "text-base" : "text-lg"}`}>{t("table.prepareTitle")}</p>
      ) : (
        <TrumpBig trump={trump} flipped={flipped} compact={compact} />
      )}
      <p className={`text-cream-50 ${compact ? "mt-2 text-xs" : "mt-3 text-sm"}`}>{t("table.yourDiscard", { cap })}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button disabled={busy || selectedCount > cap} onClick={onDiscard}>
          {selectedCount > 0 ? t("table.discardN", { count: selectedCount }) : t("table.keepAll")}
        </Button>
        <Button
          variant="ghost"
          disabled={busy || sitOutBlock !== null}
          onClick={onSitOut}
          title={sitOutBlock ? t(`table.sitOutBlocked.${sitOutBlock}`, { threshold }) : undefined}
        >
          {t("table.sitOut")}
        </Button>
      </div>
      {sitOutBlock && <p className="mt-2 text-xs text-cream-100/60">{t(`table.sitOutBlocked.${sitOutBlock}`, { threshold })}</p>}
      {!sitOutBlock && youFlipped && <p className="mt-2 text-xs text-gold-400">{t("table.flippedFree")}</p>}
      {prepare && <p className="mt-2 text-xs text-cream-100/50">{t("table.prepareHint")}</p>}
    </motion.div>
  );
}

export type HistoryRow = {
  index: number;
  trump: Suit | null;
  cells: { seat: number; decision: "pending" | "in" | "out"; tricksWon: number; delta: number; scoreAfter: number }[];
};

/** Short status update for the round that just ended; the full matrix lives in Standings. */
export function RoundResult({
  seats,
  trump,
  dark = false,
  winnerName,
  gameOver,
  onBack,
  isOwner,
  hasRematch,
  onRematch,
  busy,
}: {
  seats: SeatView[];
  trump: Suit | null;
  dark?: boolean;
  winnerName: string | null;
  gameOver: boolean;
  onBack: () => void;
  isOwner: boolean;
  hasRematch: boolean;
  onRematch: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const ordered = [...seats].sort((a, b) => (a.scoreAfter ?? a.score) - (b.scoreAfter ?? b.score));
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="mx-auto w-full max-w-md rounded-2xl border border-gold-400/50 bg-black/75 p-5 text-center shadow-2xl"
    >
      <p className="text-xs uppercase tracking-widest text-gold-400">{gameOver ? t("table.gameOver") : t("table.roundOver")}</p>
      {gameOver && winnerName && <p className="mt-1 font-display text-2xl font-bold text-cream-50">{t("table.winner", { name: winnerName })}</p>}
      {trump && (
        <p className="mt-1 text-sm text-cream-100/70">
          {t("table.trump")}: <span className={trump === "H" || trump === "D" ? "text-heart" : "text-cream-50"}>{SUIT_SYMBOLS[trump]}</span> {t(`suits.${trump}`)}
          {trump === "H" && <span className="ml-1 rounded bg-heart px-1 text-[10px] font-bold text-white">{dark ? "×4" : "×2"}</span>}
        </p>
      )}
      {/* At the end of the game the classification below says this and more. */}
      {!gameOver && (
      <ul className="mt-3 divide-y divide-white/10">
        {ordered.map((s) => (
          <li key={s.seat} className="flex items-center gap-3 py-2 text-sm">
            <span className={`flex-1 truncate text-left ${s.isMe ? "font-semibold text-gold-400" : "text-cream-50"}`}>{s.isMe ? t("common.you") : s.name}</span>
            <span className="text-cream-100/60">
              {s.decision === "out" ? "–" : `${s.tricksWon} ${t("table.tricks")}${s.tricksWon === 0 ? ` · ${t("table.blank")}` : ""}`}
            </span>
            <span className={`w-10 text-right font-bold ${s.decision === "out" ? "text-cream-100/35" : (s.delta ?? 0) < 0 ? "text-emerald-300" : (s.delta ?? 0) > 0 ? "text-heart" : "text-cream-100/50"}`}>
              {s.decision === "out" ? "–" : s.delta === undefined ? "" : s.delta > 0 ? `+${s.delta}` : s.delta}
            </span>
            <span className="w-10 text-right font-mono text-base font-bold text-cream-50">{s.scoreAfter ?? s.score}</span>
          </li>
        ))}
      </ul>
      )}
      {gameOver ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {(isOwner || hasRematch) && (
            <Button disabled={busy} onClick={onRematch}>
              {hasRematch ? t("table.joinRematch") : t("table.playAgain")}
            </Button>
          )}
          <Button variant="ghost" onClick={onBack}>
            {t("table.backToLobby")}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-cream-100/60">{t("table.nextRoundSoon")}</p>
      )}
    </motion.div>
  );
}

/** Big centre-table reveal when someone names the trump. */
export function TrumpReveal({ trump, byName, flipped, dark }: { trump: Suit; byName: string; flipped?: string | null; dark?: boolean }) {
  const { t } = useTranslation();
  const red = trump === "H" || trump === "D";
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0, rotate: -12 }}
      animate={{ scale: [0.3, 1.15, 1], opacity: [0, 1, 1], rotate: [-12, 3, 0] }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ duration: 0.7, times: [0, 0.6, 1] }}
      className="pointer-events-none flex flex-col items-center rounded-3xl border border-gold-400/50 bg-black/65 px-8 py-5 text-center shadow-2xl"
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
          <CardFace card={flipped as CardT} width={64} />
        </motion.div>
      )}
      <motion.span
        className={`mt-1 text-[6rem] leading-none drop-shadow-[0_0_24px_rgba(232,184,74,0.7)] ${red ? "text-heart" : "text-cream-50"}`}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      >
        {SUIT_SYMBOLS[trump]}
      </motion.span>
      <p className="font-display text-3xl font-extrabold text-cream-50">{t(`suits.${trump}`).split(" ")[0]}</p>
      {dark && <p className="mt-1 rounded bg-heart px-2 py-0.5 text-sm font-extrabold text-white">×4</p>}
      {trump === "H" && !dark && <p className="mt-1 text-sm font-semibold text-heart">{t("table.heartsNote")}</p>}
      {trump === "C" && <p className="mt-1 text-sm font-semibold text-cream-100/90">{t("table.clubsNote")}</p>}
    </motion.div>
  );
}
