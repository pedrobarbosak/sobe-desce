import { useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { CURSE_POINTS, MAX_POWERUPS, type Card as CardT, type PassSpec, type Powerup } from "@/engine";
import { Button } from "@/components/ui/Button";
import { CardFace } from "./Card";
import { POWERUP_ICONS } from "./party";
import type { SeatView } from "./Seat";

const PASS_ARROWS: Record<PassSpec["direction"], string> = { left: "↰", right: "↱", across: "↕" };

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
