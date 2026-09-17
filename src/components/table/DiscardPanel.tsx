import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { SitOutBlock, Suit } from "@/engine";
import { Button } from "@/components/ui/Button";
import { TrumpBig } from "./TrumpPanels";

/** A decision made while somebody else was on the clock, sent the moment the turn arrives. */
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
  short = false,
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
  /** A phone on its side: tighter still. */
  short?: boolean;
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
  const box = `rounded-2xl border bg-black/70 text-center backdrop-blur short:bg-black/90 ${short ? "p-2.5" : compact ? "p-3" : "p-4"} ${
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
      <p className={`text-cream-50 ${short ? "mt-1 text-xs" : compact ? "mt-2 text-xs" : "mt-3 text-sm"}`}>{cap > 0 ? t("table.yourDiscard", { cap }) : t("table.noDiscards")}</p>
      <div className={`flex flex-wrap justify-center gap-2 ${short ? "mt-2" : "mt-3"}`}>
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
