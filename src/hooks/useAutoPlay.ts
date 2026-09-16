import { useCallback, useEffect, useRef, useState } from "react";
import { type Card, type DeckSize, type RoundRules, type Suit, type TrickInProgress, obviousPlay } from "@/engine";

const KEY = "sd.autoplay";
/** A short pause before the card goes, so the trick is seen before it moves on. */
const AUTO_PLAY_DELAY_MS = 700;

type Input = {
  /** One value per turn, so a turn is only ever played once. */
  turnKey: string | null;
  /** It is the viewer's turn to play a card, and the hand on screen is the real one. */
  myTurnToPlay: boolean;
  hand: Card[] | null;
  trick: TrickInProgress | null;
  trump: Suit | null;
  deck: DeckSize;
  rules: RoundRules;
  onPlay: (card: Card) => void;
};

/**
 * Auto-play: when there is nothing to decide, the card goes by itself. The choice of card
 * is the engine's `obviousPlay`; this hook only remembers whether the player wants it and
 * fires it once per turn. The preference is per device.
 */
export function useAutoPlay(input: Input): { enabled: boolean; setEnabled: (on: boolean) => void } {
  const [enabled, setEnabledState] = useState(() => {
    try {
      return localStorage.getItem(KEY) === "1";
    } catch {
      return false;
    }
  });
  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    try {
      localStorage.setItem(KEY, on ? "1" : "0");
    } catch {
      /* per-device convenience only */
    }
  }, []);

  // The inputs arrive as fresh objects on every update; the effect keys on the turn alone
  // and reads the rest when it fires, so a presence heartbeat cannot restart the pause.
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  const fired = useRef<string | null>(null);
  const { turnKey, myTurnToPlay } = input;
  useEffect(() => {
    if (!enabled || !myTurnToPlay || !turnKey || fired.current === turnKey) return;
    const id = setTimeout(() => {
      const { hand, trick, trump, deck, rules, onPlay } = latest.current;
      if (!hand || !trick) return;
      const card = obviousPlay(hand, trick, trump, deck, rules);
      if (!card) return;
      fired.current = turnKey;
      onPlay(card);
    }, AUTO_PLAY_DELAY_MS);
    return () => clearTimeout(id);
  }, [enabled, myTurnToPlay, turnKey]);

  return { enabled, setEnabled };
}
