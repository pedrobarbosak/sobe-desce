import { forwardRef } from "react";
import { type Card as CardT, SUIT_SYMBOLS, rankOf, suitOf } from "@/engine";

const SUIT_COLOR = { H: "#d1213a", D: "#e4501e", C: "#1c1c1c", S: "#1c2b4a" } as const;

/**
 * The cards that rank above the 10, 9 and 8. On a 52-card deck players kept reading the 7
 * as low, so the top five wear a gold frame and show their rank in the middle.
 */
const COURT_RANKS: ReadonlySet<string> = new Set(["A", "7", "K", "J", "Q"]);

type Props = {
  card: CardT;
  width?: number;
  dimmed?: boolean;
  selected?: boolean;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  title?: string;
  /** Accessible name. Defaults to the rank and the suit glyph, which screen readers read poorly. */
  label?: string;
  /** Shown but not playable: announced as such rather than silently ignoring the press. */
  disabled?: boolean;
  /** Discard phase: the card is a toggle rather than an action, so it reports pressed state. */
  toggle?: boolean;
};

export const CardFace = forwardRef<HTMLDivElement, Props>(function CardFace(
  { card, width = 72, dimmed, selected, className = "", style, onClick, title, label, disabled, toggle },
  ref,
) {
  const suit = suitOf(card);
  const rank = rankOf(card);
  const color = SUIT_COLOR[suit];
  const height = width * 1.42;
  const court = COURT_RANKS.has(rank);
  return (
    <div
      ref={ref}
      title={title}
      onClick={onClick}
      // A role of button that cannot be focused or pressed is worse than no role at all:
      // it announces a control and then refuses to work. Space is prevented because it
      // would otherwise scroll the page out from under the table.
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              onClick();
            }
          : undefined
      }
      className={`card-face relative select-none ${court ? "card-court" : ""} ${onClick ? "cursor-pointer" : ""} ${dimmed ? "opacity-45 saturate-50" : ""} ${selected ? "card-selected" : ""} ${className}`}
      style={{ width, height, fontSize: width * 0.3, ...style }}
      role={onClick ? "button" : "img"}
      tabIndex={onClick ? 0 : undefined}
      aria-disabled={disabled || undefined}
      aria-pressed={toggle ? selected === true : undefined}
      aria-label={label ?? `${rank}${SUIT_SYMBOLS[suit]}`}
    >
      <div className="absolute left-1.5 top-1 flex flex-col items-center leading-none" style={{ color }}>
        <span className="font-display font-extrabold">{rank}</span>
        <span style={{ fontSize: "0.8em" }}>{SUIT_SYMBOLS[suit]}</span>
      </div>
      <div className="absolute bottom-1 right-1.5 flex rotate-180 flex-col items-center leading-none" style={{ color }}>
        <span className="font-display font-extrabold">{rank}</span>
        <span style={{ fontSize: "0.8em" }}>{SUIT_SYMBOLS[suit]}</span>
      </div>
      {court ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none" style={{ color }}>
          <span className="font-display font-extrabold" style={{ fontSize: width * 0.46 }}>{rank}</span>
          <span style={{ fontSize: width * 0.26 }}>{SUIT_SYMBOLS[suit]}</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center" style={{ color, fontSize: width * 0.62 }}>
          {SUIT_SYMBOLS[suit]}
        </div>
      )}
      {selected && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 rounded-full bg-gold-400 px-2 text-[11px] font-bold text-ink-900 shadow" style={{ fontSize: Math.max(11, width * 0.16) }}>
          ✓
        </div>
      )}
    </div>
  );
});

export function CardBack({ width = 72, className = "", style }: { width?: number; className?: string; style?: React.CSSProperties }) {
  return <div className={`card-back ${className}`} style={{ width, height: width * 1.42, ...style }} aria-hidden />;
}
