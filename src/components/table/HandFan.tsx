import { memo, useState } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { type Card as CardT, type DeckSize, type Suit, type TrickInProgress, illegalReason, sortHand } from "@/engine";
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
};

export const HandFan = memo(function HandFan({ hand, deck, trump, trick, canPlay, selectable, selected, onToggle, onPlay, cardWidth, maxWidth }: Props) {
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
    <div className="relative mx-auto" style={{ height: cardWidth * 1.42 + 28, width: overlap * (n - 1) + cardWidth }}>
      {cards.map((card, i) => {
          const reason = canPlay && trick && trump ? illegalReason(hand, card, trick, trump, deck) : null;
          const legal = canPlay && reason === null;
          const angle = (i - (n - 1) / 2) * spread;
          const lift = Math.abs(i - (n - 1) / 2) * 3;
          const isSelected = selected.has(card);
          const interactive = legal || selectable;
          const isHovered = hovered === card;
          return (
            <motion.div
              key={card}
              className="absolute bottom-0"
              style={{ zIndex: isHovered ? 60 : i, transformOrigin: "50% 120%", willChange: "transform" }}
              onMouseEnter={() => setHovered(card)}
              onMouseLeave={() => setHovered((h) => (h === card ? null : h))}
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
                className={isHovered && interactive ? "card-hover" : ""}
                onClick={
                  legal ? () => onPlay(card) : selectable ? () => onToggle(card) : undefined
                }
                title={reason && reason !== "notInHand" ? t(`table.illegal.${reason}`) : undefined}
              />
            </motion.div>
          );
        })}
    </div>
  );
});
