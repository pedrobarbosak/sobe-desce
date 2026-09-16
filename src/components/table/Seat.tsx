import { memo } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { LuEye, LuShield, LuSkull, LuUsers } from "react-icons/lu";
import { CURSE_POINTS, type Card as CardT, type DeckSize, type Suit, SUIT_SYMBOLS, sortHand } from "@/engine";
import { Avatar } from "@/components/ui/Avatar";
import { CardBack, CardFace } from "./Card";
import { TimerRing } from "./TimerRing";

export type SeatView = {
  seat: number;
  name: string;
  avatarSeed: string;
  isBot: boolean;
  botControlled: boolean;
  botReason: "abandoned" | "kicked" | "disconnected" | null;
  left: boolean;
  score: number;
  online: boolean;
  isMe: boolean;
  decision: "pending" | "in" | "out";
  tricksWon: number;
  handSize: number;
  delta?: number;
  scoreAfter?: number;
};

type Props = {
  seat: SeatView;
  x: number;
  y: number;
  /** This seat settles the trump for the round. Players read this; the dealer is noise. */
  isTrumpSeat: boolean;
  /** The trump came off the stock rather than out of their head. */
  flipped: boolean;
  isTurn: boolean;
  deadline: number | null;
  totalMs: number;
  skewMs: number;
  phase: "vote" | "trump" | "discard" | "pass" | "market" | "dummy" | "tricks" | "scored";
  compact?: boolean;
  size?: number;
  /** Face-up hand, shown only to a viewer who sat this round out. */
  openHand?: string[] | null;
  deck: DeckSize;
  trump: Suit | null;
  /** Party: curses laid on this seat this round. */
  cursed?: number;
  /** Party: this seat cancelled its own blank penalty. */
  shielded?: boolean;
  /** Party: the viewer is looking at this hand through a peek. */
  peeked?: boolean;
  /** Party: the viewer guards this seat and scores its result. */
  ward?: boolean;
  /** Party "team": this seat and the viewer play the round together. */
  partner?: boolean;
  /** Party "faceUp": the one card of this hand everyone can see. */
  faceUp?: string | null;
};

export const Seat = memo(function Seat({ seat, x, y, isTrumpSeat, flipped, isTurn, deadline, totalMs, skewMs, phase, compact, size: sizeProp, openHand, deck, trump, cursed = 0, shielded = false, peeked = false, ward = false, partner = false, faceUp = null }: Props) {
  const { t } = useTranslation();
  const size = sizeProp ?? (compact ? 44 : 56);
  const open = openHand && openHand.length > 0 ? sortHand(openHand as CardT[], deck, trump ?? undefined) : null;
  const openWidth = Math.round(size * 0.62);
  // Both badges carry information people act on, so they scale with the avatar.
  const badge = Math.round(Math.max(20, size * 0.46));
  return (
    <motion.div
      className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {!seat.isMe && open ? (
        <div className="relative mb-1" style={{ width: openWidth + (open.length - 1) * openWidth * 0.55, height: openWidth * 1.42 }}>
          {/* CardFace positions itself `relative`, so the offset lives on a wrapper. */}
          {open.map((card, i) => (
            <div
              key={card}
              className="absolute top-0"
              style={{ left: i * openWidth * 0.55, transform: `rotate(${(i - (open.length - 1) / 2) * 4}deg)`, zIndex: i }}
            >
              <CardFace card={card} width={openWidth} className="shadow-md" />
            </div>
          ))}
        </div>
      ) : (
        !seat.isMe &&
        seat.handSize > 0 &&
        phase !== "scored" && (
          <div className="relative mb-1 flex items-end gap-1">
            <div className="relative h-6" style={{ width: 18 + seat.handSize * 7 }} aria-hidden>
              {Array.from({ length: seat.handSize }).map((_, i) => (
                <CardBack key={i} width={20} className="absolute top-0" style={{ left: i * 7, transform: `rotate(${(i - (seat.handSize - 1) / 2) * 5}deg)` }} />
              ))}
            </div>
            {faceUp && <CardFace card={faceUp as CardT} width={Math.round(size * 0.5)} className="shadow-md ring-1 ring-gold-400" title={t("party.faceUpCard")} />}
          </div>
        )
      )}
      <div className="relative" style={{ width: size, height: size }}>
        <Avatar seed={seat.avatarSeed} size={size} className={seat.decision === "out" ? "opacity-50 grayscale" : ""} />
        {isTurn && deadline && <TimerRing deadline={deadline} totalMs={totalMs} size={size} skewMs={skewMs} />}
        {isTurn && (
          <motion.span
            className="absolute -inset-1 rounded-full ring-2 ring-gold-400"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ repeat: Infinity, duration: 1.6 }}
          />
        )}
        {isTrumpSeat && (
          <span
            className={`absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full bg-cream-50 font-bold shadow-md ring-2 ${
              trump ? "ring-gold-400" : "ring-gold-400/60"
            } ${trump === "H" || trump === "D" ? "text-heart" : "text-ink-900"}`}
            style={{ width: badge, height: badge, fontSize: Math.round(badge * 0.66), lineHeight: 1 }}
            title={trump ? t(flipped ? "table.flippedTrumpBadge" : "table.setTrumpBadge") : t("table.choosingTrumpBadge")}
          >
            {trump ? SUIT_SYMBOLS[trump] : "?"}
          </span>
        )}
        {!seat.isBot && !seat.online && !seat.left && (
          <span className="absolute -bottom-0.5 -left-0.5 h-3 w-3 rounded-full border-2 border-felt-900 bg-zinc-400" title={t("common.offline")} />
        )}
        {seat.tricksWon > 0 && (
          <span
            className="absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full bg-gold-400 font-bold text-ink-900 shadow-md ring-2 ring-ink-900/25"
            style={{ width: badge, height: badge, fontSize: Math.round(badge * 0.6), lineHeight: 1 }}
            title={t("table.tricksWonBadge", { n: seat.tricksWon })}
          >
            {seat.tricksWon}
          </span>
        )}
      </div>
      <div className="max-w-[7rem] truncate rounded-md bg-black/40 px-2 py-0.5 text-center text-[11px] font-semibold text-cream-50">
        {seat.isMe ? t("common.you") : seat.name}
      </div>
      {(cursed > 0 || shielded || peeked || ward || partner) && (
        <div className="flex gap-1 text-[10px] font-semibold">
          {partner && (
            <span className="rounded bg-gold-400 px-1 text-ink-900" title={t("party.partnerHint")}>
              <LuUsers className="icon" /> {t("party.partner")}
            </span>
          )}
          {ward && (
            <span className="rounded bg-gold-400 px-1 text-ink-900" title={t("party.wardHint")}>
              <LuShield className="icon" /> {t("party.ward")}
            </span>
          )}
          {cursed > 0 && (
            <span className="rounded bg-purple-700/80 px-1 text-white" title={t("party.cursedPoints", { points: cursed * CURSE_POINTS })}>
              <LuSkull className="icon" /> +{cursed * CURSE_POINTS}
            </span>
          )}
          {shielded && (
            <span className="rounded bg-sky-700/80 px-1 text-white" title={t("party.shielded")}>
              <LuShield className="icon" />
            </span>
          )}
          {peeked && (
            <span className="rounded bg-gold-400 px-1 text-ink-900" title={t("party.peeked")}>
              <LuEye className="icon" />
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-1 text-[11px]">
        <span className="rounded bg-cream-100 px-1.5 font-mono font-bold text-ink-900">{seat.score}</span>
        {seat.decision === "out" && phase !== "scored" && <span className="rounded bg-black/40 px-1 text-cream-100/70">{t("table.out")}</span>}
        {seat.botControlled && (
          <span
            className="rounded bg-white/15 px-1 text-cream-100/80"
            title={seat.botReason ? t(`table.botReason.${seat.botReason}`, { name: seat.name }) : undefined}
          >
            {t("table.botStandIn")}
          </span>
        )}
        {seat.left && <span className="rounded bg-heart/70 px-1 text-white">{t("table.left")}</span>}
        {phase === "scored" && seat.delta !== undefined && (
          <motion.span
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`rounded px-1.5 font-bold ${seat.delta < 0 ? "bg-emerald-400 text-ink-900" : seat.delta > 0 ? "bg-heart text-white" : "bg-black/40 text-cream-100/70"}`}
          >
            {seat.delta > 0 ? `+${seat.delta}` : seat.delta}
          </motion.span>
        )}
      </div>
    </motion.div>
  );
});
