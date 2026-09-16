import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { CURSE_POINTS, LIGHTNING_SECONDS, MAX_POWERUPS, type Card as CardT, type PassSpec, type Powerup, type Rank, SUITS, SUIT_SYMBOLS, type Suit, type SitOutBlock, type Twist } from "@/engine";
import { Button } from "@/components/ui/Button";
import { CardBack, CardFace } from "./Card";
import { PARTY_TWIST_ICONS } from "./partyIcons";
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

export const POWERUP_ICONS: Record<Powerup, string> = { peek: "👁", curse: "☠", shield: "🛡" };
const PASS_ARROWS: Record<PassSpec["direction"], string> = { left: "↰", right: "↱", across: "↕" };

export type PartyView = {
  twist: Twist;
  goldenSuit: Suit | null;
  pass: PassSpec | null;
  wildRank: Rank | null;
  faceUp: (string | null)[];
  market: string[];
  marketOrder: number[];
  dummy: string[];
  dummyTurn: number;
  /** Only sent once the round is scored. */
  guardians: number[] | null;
  /** `swap`, once the deciding is over: did the hands actually move? */
  swapped: boolean | null;
  shielded: boolean[];
  curses: number[];
  peeks: { seat: number; target: number }[];
  awards: { seat: number; powerup: Powerup }[];
};

type T = (key: string, opts?: Record<string, unknown>) => string;

/** Interpolation values every twist description may use. */
export function twistVars(party: PartyView, t: T): Record<string, unknown> {
  return {
    suit: party.goldenSuit ? t(`suits.${party.goldenSuit}`).split(" ")[0] : "",
    seconds: LIGHTNING_SECONDS,
    rank: party.wildRank ?? "",
    count: party.pass?.count ?? 1,
  };
}

/** The twist's name with its drawn parameter filled in, for chips and banners. */
export function twistName(party: PartyView, t: T): string {
  if (party.twist === "pass" && party.pass) return t(`party.passNames.${party.pass.direction}`, { count: party.pass.count });
  return t(`party.twists.${party.twist}.name`, twistVars(party, t));
}

/** The round's twist, flipped face up for everyone before a card is played. */
export function TwistBanner({ party, compact = false }: { party: PartyView; compact?: boolean }) {
  const { t } = useTranslation();
  const tr = t as unknown as T;
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`rounded-xl border border-purple-400/50 bg-purple-950/70 text-cream-50 shadow-lg backdrop-blur ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-200/80">🎲 {t("party.twistOfRound")}</p>
      <p className={`font-display font-bold ${compact ? "text-sm" : "text-base"}`}>
        <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-purple-400/30 px-1 text-xs">
          {PARTY_TWIST_ICONS[party.twist]}
        </span>
        {twistName(party, tr)}
      </p>
      {!compact && <p className="max-w-[16rem] text-xs text-cream-100/75">{tr(`party.twists.${party.twist}.desc`, twistVars(party, tr))}</p>}
    </motion.div>
  );
}

/** The viewer's unspent powerups. Peek and curse ask for a target before they fire. */
export function PowerupTray({
  stash,
  targets,
  shielded,
  busy,
  onUse,
  compact = false,
}: {
  stash: Powerup[];
  /** Other seats that can be picked on. */
  targets: SeatView[];
  shielded: boolean;
  busy: boolean;
  onUse: (powerup: Powerup, target?: number) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [picking, setPicking] = useState<Powerup | null>(null);
  const label = (p: Powerup) => t(`party.powerups.${p}.name`);
  const desc = (p: Powerup) => t(`party.powerups.${p}.desc`, { points: CURSE_POINTS });
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`rounded-xl border border-purple-400/50 bg-black/70 text-cream-50 shadow-lg backdrop-blur ${compact ? "p-1.5" : "p-2"}`}
    >
      {picking ? (
        <div className="flex flex-col gap-1">
          <p className="px-1 text-[10px] font-semibold uppercase tracking-wider text-purple-200/80">
            {POWERUP_ICONS[picking]} {t("party.pickTarget", { powerup: label(picking) })}
          </p>
          {targets.map((s) => (
            <button
              key={s.seat}
              type="button"
              disabled={busy}
              onClick={() => {
                onUse(picking, s.seat);
                setPicking(null);
              }}
              className="rounded-lg px-2 py-1 text-left text-sm font-semibold hover:bg-white/10 disabled:opacity-50"
            >
              {s.name} <span className="font-mono text-xs text-cream-100/60">{s.score}</span>
            </button>
          ))}
          <button type="button" onClick={() => setPicking(null)} className="rounded-lg px-2 py-1 text-left text-xs text-cream-100/60 hover:bg-white/10">
            {t("party.cancel")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <span className="px-1 text-[10px] font-semibold uppercase tracking-wider text-purple-200/80" title={t("party.stashHint", { max: MAX_POWERUPS })}>
            {t("party.stash")}
          </span>
          {stash.map((p, i) => {
            const spent = p === "shield" && shielded;
            return (
              <button
                key={`${p}-${i}`}
                type="button"
                disabled={busy || spent}
                title={desc(p)}
                onClick={() => (p === "shield" ? onUse(p) : setPicking(p))}
                className={`flex items-center gap-1 rounded-lg border border-purple-400/40 bg-purple-900/40 font-semibold transition hover:-translate-y-0.5 hover:bg-purple-800/60 disabled:opacity-40 ${
                  compact ? "px-1.5 py-1 text-xs" : "px-2 py-1 text-sm"
                }`}
              >
                <span>{POWERUP_ICONS[p]}</span>
                <span className={compact ? "hidden sm:inline" : ""}>{label(p)}</span>
              </button>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

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
  trump: Suit | null;
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
      <p className={`text-cream-50 ${compact ? "mt-2 text-xs" : "mt-3 text-sm"}`}>{cap > 0 ? t("table.yourDiscard", { cap }) : t("table.noDiscards")}</p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <Button disabled={busy || selectedCount > cap} onClick={onDiscard}>
          {selectedCount > 0 ? t("table.discardN", { count: selectedCount }) : cap > 0 ? t("table.keepAll") : t("table.playAsDealt")}
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

/** Party "pass" and "market": pick the cards to give away. */
export function PassPanel({
  spec,
  market = false,
  targetName,
  selected,
  busy,
  onPass,
  compact = false,
}: {
  spec: PassSpec;
  /** The cards go to the middle rather than to a seat. */
  market?: boolean;
  targetName: string;
  selected: CardT[];
  busy: boolean;
  onPass: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const ready = selected.length === spec.count;
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`rounded-2xl border border-purple-400/60 bg-black/70 text-center backdrop-blur ${compact ? "p-3" : "p-4"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-200/80">
        {market ? `🏪 ${t("party.twists.market.name")}` : `${PASS_ARROWS[spec.direction]} ${t(`party.passNames.${spec.direction}`, { count: spec.count })}`}
      </p>
      <p className={`mt-1 font-display font-bold text-cream-50 ${compact ? "text-base" : "text-lg"}`}>
        {market ? t("table.layTitle") : t("table.passTitle", { count: spec.count, name: targetName })}
      </p>
      <p className="mt-1 text-xs text-cream-100/60">{market ? t("table.layHint") : t("table.passHint")}</p>
      <div className="mt-3">
        <Button disabled={busy || !ready} onClick={onPass}>
          {ready
            ? market
              ? t("table.layCard", { card: selected[0] })
              : t("table.passCards", { cards: selected.join(" ") })
            : t("table.passPick", { count: spec.count - selected.length })}
        </Button>
      </div>
    </motion.div>
  );
}

/** Party "market": the face-up cards in the middle; the seat on turn takes one back. */
export function MarketPanel({
  cards,
  mine,
  busy,
  onTake,
  compact = false,
}: {
  cards: CardT[];
  /** True while it is the viewer's turn to take. */
  mine: boolean;
  busy: boolean;
  onTake: (card: CardT) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const width = compact ? 44 : 60;
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`rounded-2xl border border-purple-400/60 bg-black/70 text-center backdrop-blur ${compact ? "p-3" : "p-4"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-200/80">🏪 {t("party.twists.market.name")}</p>
      <p className={`mt-1 font-display font-bold text-cream-50 ${compact ? "text-base" : "text-lg"}`}>
        {mine ? t("table.takeTitle") : t("table.marketWaiting")}
      </p>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {cards.map((card) => (
          <button
            key={card}
            type="button"
            disabled={!mine || busy}
            onClick={() => onTake(card)}
            className={`rounded-lg transition ${mine ? "hover:-translate-y-1.5" : "cursor-default"} disabled:opacity-90`}
            aria-label={card}
          >
            <CardFace card={card} width={width} className="shadow-md" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}

/** Party "dummy": the spare hand; the seat on turn may swap one card with it or leave it. */
export function DummyPanel({
  cards,
  mine,
  give,
  take,
  busy,
  onPickTake,
  onSwap,
  onSkip,
  compact = false,
}: {
  cards: CardT[];
  mine: boolean;
  /** The card selected in the viewer's own hand, if any. */
  give: CardT | null;
  /** The card selected on the table, if any. */
  take: CardT | null;
  busy: boolean;
  onPickTake: (card: CardT) => void;
  onSwap: () => void;
  onSkip: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const width = compact ? 44 : 60;
  return (
    <motion.div
      initial={{ y: 30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      className={`rounded-2xl border border-purple-400/60 bg-black/70 text-center backdrop-blur ${compact ? "p-3" : "p-4"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-200/80">🂠 {t("party.twists.dummy.name")}</p>
      <p className={`mt-1 font-display font-bold text-cream-50 ${compact ? "text-base" : "text-lg"}`}>
        {mine ? t("table.dummyTitle") : t("table.dummyWaiting")}
      </p>
      {mine && <p className="mt-1 text-xs text-cream-100/60">{t("table.dummyHint")}</p>}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {cards.map((card) => (
          <button
            key={card}
            type="button"
            disabled={!mine || busy}
            onClick={() => onPickTake(card)}
            className={`rounded-lg transition ${mine ? "hover:-translate-y-1.5" : "cursor-default"} ${take === card ? "-translate-y-2 ring-2 ring-gold-400" : ""}`}
            aria-label={card}
          >
            <CardFace card={card} width={width} className="shadow-md" />
          </button>
        ))}
      </div>
      {mine && (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <Button disabled={busy || give === null || take === null} onClick={onSwap}>
            {give && take ? t("table.dummySwap", { give, take }) : t("table.dummyPick")}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={onSkip}>
            {t("table.dummySkip")}
          </Button>
        </div>
      )}
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
  party = null,
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
  party?: PartyView | null;
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
          {party && party.twist === "golden" && party.goldenSuit === trump && (
            <span className="ml-1 rounded bg-gold-400 px-1 text-[10px] font-bold text-ink-900">{t("party.golden")}</span>
          )}
        </p>
      )}
      {party && (
        <p className="mt-1 text-xs text-purple-200">
          🎲 {twistName(party, t as unknown as T)}
        </p>
      )}
      {party?.swapped !== null && party?.swapped !== undefined && (
        <p className="mt-1 text-xs text-cream-100/80">🔀 {party.swapped ? t("party.swapped") : t("party.notSwapped")}</p>
      )}
      {party?.guardians && (
        <ul className="mt-2 space-y-0.5 text-xs text-cream-100/80">
          {party.guardians.map((ward, seat) => (
            <li key={seat} className={seats[seat]?.isMe ? "font-semibold text-gold-400" : ""}>
              🛡 {t("party.guarded", { name: seats[seat]?.isMe ? t("common.you") : seats[seat]?.name ?? "?", ward: seats[ward]?.isMe ? t("common.you") : seats[ward]?.name ?? "?" })}
            </li>
          ))}
        </ul>
      )}
      {party && party.awards.length > 0 && !gameOver && (
        <ul className="mt-2 space-y-0.5 text-xs text-cream-100/80">
          {party.awards.map((a, i) => {
            const who = seats[a.seat];
            const powerup = `${POWERUP_ICONS[a.powerup]} ${t(`party.powerups.${a.powerup}.name`)}`;
            return (
              <li key={i} className={who?.isMe ? "font-semibold text-gold-400" : ""}>
                {who?.isMe ? t("party.youDrew", { powerup }) : t("party.drew", { name: who?.name ?? "?", powerup })}
              </li>
            );
          })}
        </ul>
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

/** The round's twist, announced in the middle of the felt the moment the round is dealt. */
export function TwistReveal({ party, compact = false }: { party: PartyView; compact?: boolean }) {
  const { t } = useTranslation();
  const tr = t as unknown as T;
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
      animate={{ scale: [0.3, 1.12, 1], opacity: [0, 1, 1], rotate: [-8, 2, 0] }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ duration: 0.7, times: [0, 0.6, 1] }}
      className={`pointer-events-none flex flex-col items-center rounded-3xl border border-purple-400/60 bg-black/70 text-center shadow-2xl ${
        compact ? "max-w-[20rem] px-5 py-4" : "max-w-md px-8 py-5"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-purple-200/80">🎲 {t("party.twistOfRound")}</p>
      <motion.span
        className={`mt-1 leading-none drop-shadow-[0_0_24px_rgba(168,85,247,0.7)] ${compact ? "text-[4rem]" : "text-[5.5rem]"}`}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      >
        {PARTY_TWIST_ICONS[party.twist]}
      </motion.span>
      <p className={`mt-1 font-display font-extrabold text-cream-50 ${compact ? "text-2xl" : "text-3xl"}`}>{twistName(party, tr)}</p>
      <p className={`mt-1 text-cream-100/80 ${compact ? "text-xs" : "text-sm"}`}>{tr(`party.twists.${party.twist}.desc`, twistVars(party, tr))}</p>
    </motion.div>
  );
}

function CoinFace({ icon, label, size, back = false }: { icon: string; label: string; size: number; back?: boolean }) {
  return (
    <div
      className="backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-full text-ink-900"
      style={{
        transform: back ? "rotateY(180deg)" : undefined,
        border: `${Math.round(size * 0.05)}px solid var(--color-brass-600)`,
        background: "radial-gradient(circle at 35% 30%, #fff3c4 0%, var(--color-gold-400) 45%, var(--color-gold-600) 100%)",
        boxShadow: "inset 0 0 0 2px rgb(255 243 196 / 0.6), inset 0 0 24px rgb(125 90 23 / 0.35), 0 12px 30px rgb(0 0 0 / 0.45)",
      }}
    >
      <span style={{ fontSize: size * 0.36, lineHeight: 1 }}>{icon}</span>
      <span className="mt-1 font-display font-extrabold uppercase" style={{ fontSize: Math.max(11, size * 0.11), letterSpacing: "0.2em" }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Party "swap": the coin that decides whether the hands move, tossed in the middle of the
 * felt. Heads (the hands move) is the front face; the coin spins a few full turns and
 * settles on whichever side actually came up, then the verdict is written out below it.
 */
export function CoinFlip({ swapped, compact = false }: { swapped: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const size = compact ? 110 : 160;
  const spins = 5;
  const landed = 360 * spins + (swapped ? 0 : 180);
  const flightMs = 1900;
  return (
    <motion.div
      className="pointer-events-none flex flex-col items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.25 }}
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-cream-100/70">
        {PARTY_TWIST_ICONS.swap} {t("party.twists.swap.name")} · {t("party.coinToss")}
      </p>
      <div className="mt-4" style={{ perspective: 900, width: size, height: size }}>
        <motion.div
          className="preserve-3d relative h-full w-full"
          initial={{ rotateY: 0, y: 0 }}
          animate={{ rotateY: landed, y: [0, -size * 0.9, 0, -size * 0.16, 0] }}
          transition={{
            rotateY: { duration: flightMs / 1000, ease: [0.25, 0.7, 0.3, 1] },
            y: { duration: flightMs / 1000, times: [0, 0.42, 0.8, 0.9, 1], ease: ["easeOut", "easeIn", "easeOut", "easeIn"] },
          }}
        >
          <CoinFace icon="🔀" label={t("party.coinHeads")} size={size} />
          <CoinFace icon="✋" label={t("party.coinTails")} size={size} back />
        </motion.div>
      </div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: flightMs / 1000 + 0.05 }}
        className={`mt-4 rounded-full bg-black/65 px-4 py-1.5 font-display font-extrabold text-cream-50 shadow-xl backdrop-blur ${compact ? "text-lg" : "text-2xl"}`}
      >
        {swapped ? t("party.coinMoved") : t("party.coinStayed")}
      </motion.p>
    </motion.div>
  );
}
