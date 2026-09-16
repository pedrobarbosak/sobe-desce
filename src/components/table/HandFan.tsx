import { memo, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { CLASSIC_RULES, type Card as CardT, type DeckSize, type RoundRules, type Suit, type TrickInProgress, illegalReason, rankOf, sortHand, suitOf } from "@/engine";
import { CardFace } from "./Card";

type Props = {
  hand: CardT[];
  deck: DeckSize;
  trump: Suit | null;
  trick: TrickInProgress | null;
  /** true while it is the viewer's turn to play a card */
  canPlay: boolean;
  /** discard phase: selectable cards */
  selectable: boolean;
  selected: Set<CardT>;
  onToggle: (card: CardT) => void;
  onPlay: (card: CardT) => void;
  cardWidth: number;
  /** Maximum width the fan may take; overlap tightens to fit. */
  maxWidth: number;
  /** The round's rules; a party twist may turn the climb rule upside down. */
  rules?: RoundRules;
  /** Party "markedCard": this card cannot be discarded, so it is never selectable. */
  locked?: CardT | null;
};

export const HandFan = memo(function HandFan({ hand, deck, trump, trick, canPlay, selectable, selected, onToggle, onPlay, cardWidth, maxWidth, rules = CLASSIC_RULES, locked = null }: Props) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState<CardT | null>(null);
  const cards = sortHand(hand, deck, trump ?? undefined);
  const n = cards.length;
  const spread = Math.min(8, 30 / Math.max(1, n));
  // Cards show most of their face so each one is an easy hover and click target;
  // the fan only tightens when the screen cannot fit it.
  const natural = cardWidth * 0.84;
  const overlap = n > 1 ? Math.min(natural, Math.max(cardWidth * 0.3, (maxWidth - cardWidth) / (n - 1))) : natural;
  return (
    <div
      className="relative mx-auto"
      style={{ height: cardWidth * 1.42 + 28, width: overlap * (n - 1) + cardWidth }}
      role="group"
      aria-label={t("table.handLabel")}
    >
      {cards.map((card, i) => {
          const reason = canPlay && trick ? illegalReason(hand, card, trick, trump, deck, rules) : null;
          const legal = canPlay && reason === null;
          const angle = (i - (n - 1) / 2) * spread;
          const lift = Math.abs(i - (n - 1) / 2) * 3;
          const isSelected = selected.has(card);
          const isLocked = card === locked;
          const why = isLocked && selectable ? t("party.markedCardStays") : reason && reason !== "notInHand" ? t(`table.illegal.${reason}`) : null;
          const name = t("table.cardLabel", { rank: rankOf(card), suit: t(`suits.${suitOf(card)}`) });
          const interactive = legal || (selectable && !isLocked);
          const isHovered = hovered === card;
          return (
            <motion.div
              key={card}
              className="absolute bottom-0"
              style={{ zIndex: isHovered ? 60 : i, transformOrigin: "50% 120%", willChange: "transform" }}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setHovered(card);
              }}
              onPointerLeave={() => setHovered((h) => (h === card ? null : h))}
              initial={{ left: i * overlap, y: -260, opacity: 0, rotate: -30 }}
              animate={{ left: i * overlap, y: isSelected ? -26 : lift, opacity: 1, rotate: angle }}
              whileHover={interactive ? { y: -30, scale: 1.1, rotate: 0 } : { y: -8 }}
              transition={{ type: "spring", stiffness: 300, damping: 26 }}
            >
              <CardFace
                card={card}
                width={cardWidth}
                dimmed={canPlay && !legal}
                selected={isSelected}
                toggle={selectable && !isLocked}
                disabled={(canPlay && !legal) || (selectable && isLocked)}
                className={`${isHovered && interactive ? "card-hover" : ""} ${isLocked ? "ring-2 ring-heart" : ""}`}
                onClick={
                  legal ? () => onPlay(card) : selectable && !isLocked ? () => onToggle(card) : undefined
                }
                title={why ?? undefined}
                // Why a card cannot be played was a tooltip only, so on a phone the rule
                // the game turns on was invisible. It belongs in the name either way.
                label={why ? `${name}, ${why}` : name}
              />
            </motion.div>
          );
        })}
    </div>
  );
});
