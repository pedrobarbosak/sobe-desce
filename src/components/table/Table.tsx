import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { type Card as CardT, type Suit, SUIT_SYMBOLS, type TrickInProgress, currentWinner, sitOutBlockedReason } from "@/engine";
import { errorCode } from "@/lib/errors";
import { useTrickDisplay } from "@/hooks/useTrickDisplay";
import { useElementSize } from "@/hooks/useElementSize";
import { useSoundSettings } from "@/hooks/useSound";
import { sound } from "@/lib/sound";
import { Avatar } from "@/components/ui/Avatar";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { LobbyView } from "@/components/game/LobbyView";
import { StandingsView } from "@/components/game/StandingsView";
import { HistoryView } from "@/components/game/HistoryView";
import { CardBack } from "./Card";
import { HandFan } from "./HandFan";
import { Seat } from "./Seat";
import { TimerRing } from "./TimerRing";
import { TrickArea } from "./TrickArea";
import { TableStatus } from "./TableStatus";
import { DarkCall } from "./DarkCall";
import { type PlayedTrick, TrickHistory } from "./TrickHistory";
import { Drawer } from "./Drawer";
import { type PendingChoice, DiscardPanel, RoundResult, TrumpPicker, TrumpReveal } from "./panels";
import { type Ellipse, ringLayout, ringPlacer } from "./geometry";

export type TableData = NonNullable<FunctionReturnType<typeof api.game.table.get>>;

/**
 * Codes that only ever mean "the table moved on between the click and the mutation
 * landing". The UI has already corrected itself, so a banner would just be noise.
 */
const RACE_CODES = ["notYourTurn", "wrongPhase", "alreadyDecided"];

/**
 * Full-viewport table. A thin bar on top, the felt fills the rest; every size (cards,
 * avatars, ellipse) derives from the measured felt so it works from phones to ultrawides.
 */
export function Table({ data }: { data: TableData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { game, session, round, seats, mySeat, myHand } = data;
  const nameTrump = useMutation(api.game.actions.nameTrump);
  const flipTrump = useMutation(api.game.actions.flipTrump);
  const darkHearts = useMutation(api.game.actions.darkHearts);
  const revealHand = useMutation(api.game.actions.revealHand);
  const discard = useMutation(api.game.actions.discard);
  const sitOut = useMutation(api.game.actions.sitOut);
  const playCard = useMutation(api.game.actions.playCard);
  const rematch = useMutation(api.games.rematch);
  const abandonSeat = useMutation(api.games.abandonSeat);
  const closeSitting = useMutation(api.sessions.close);
  const [selected, setSelected] = useState<Set<CardT>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChoice | null>(null);
  const [drawer, setDrawer] = useState<"lobby" | "standings" | "history" | null>(null);
  const felt = useElementSize<HTMLDivElement>();

  const roundId = round?._id;
  const roundPhase = round?.phase;
  const turnSeatNow = round?.turnSeat ?? null;
  // Selection and any prepared choice belong to one round + phase, not to one turn: a
  // player picks cards while others are still deciding.
  useEffect(() => {
    setSelected(new Set());
    setPending(null);
  }, [roundId, roundPhase]);

  // Big reveal when the trump gets named by someone else.
  const roundTrump = round?.trump ?? null;
  const namerSeat = round?.trumpSeat ?? (round && session ? (round.dealerSeat + 1) % session.seatCount : -1);
  const flippedCard = round?.flipped ?? null;
  const isDark = round?.darkHearts === true;
  // The server is still holding this seat's cards back, so the blind offer stands.
  const blindDeadline = data.inTheDark ? round?.darkUntil ?? null : null;
  const [reveal, setReveal] = useState<{ suit: Suit; roundId: string } | null>(null);
  const seenTrump = useRef<{ roundId: string | undefined; trump: string | null }>({ roundId: undefined, trump: null });
  useEffect(() => {
    const prev = seenTrump.current;
    seenTrump.current = { roundId, trump: roundTrump };
    if (!roundId || !roundTrump) return;
    if (prev.roundId === roundId && prev.trump === null && (namerSeat !== mySeat || flippedCard !== null)) {
      setReveal({ suit: roundTrump as Suit, roundId });
    }
  }, [roundId, roundTrump, namerSeat, mySeat, flippedCard]);
  // Clearing is its own effect: hanging it off the one above meant a re-run could cancel
  // the timer without re-arming it, leaving the reveal parked over the discard panel.
  useEffect(() => {
    if (!reveal) return;
    const id = setTimeout(() => setReveal(null), 2600);
    return () => clearTimeout(id);
  }, [reveal]);

  const soundSettings = useSoundSettings();

  // ---- sound cues, derived from state changes
  const playCount = round?.currentTrick.plays.length ?? 0;
  const trickCount = round?.completedTricks.length ?? 0;
  const lastPlays = useRef({ roundId, playCount, trickCount });
  useEffect(() => {
    const prev = lastPlays.current;
    lastPlays.current = { roundId, playCount, trickCount };
    if (prev.roundId !== roundId) return;
    if (playCount > prev.playCount || trickCount > prev.trickCount) sound.play("card");
    if (trickCount > prev.trickCount) {
      const last = round?.completedTricks[trickCount - 1];
      const inTrick = last?.plays.some((p) => p.seat === mySeat) ?? false;
      const cue = !inTrick ? "trick" : last?.winner === mySeat ? "trickWin" : "trickLose";
      setTimeout(() => sound.play(cue), 250);
    }
  }, [roundId, playCount, trickCount]); // eslint-disable-line react-hooks/exhaustive-deps
  const phaseForSound = round?.phase;
  const winnerForSound = round?.winnerSeat ?? null;
  useEffect(() => {
    if (phaseForSound !== "scored") return;
    if (winnerForSound === null) sound.play("round");
    else sound.play(winnerForSound === mySeat ? "win" : "lose");
  }, [phaseForSound, winnerForSound, roundId, mySeat]);
  useEffect(() => {
    if (reveal) sound.play("trump");
  }, [reveal]);

  const display = useTrickDisplay(
    round ? { _id: round._id, currentTrick: round.currentTrick as TrickInProgress, completedTricks: round.completedTricks as never } : null,
  );
  // Clock skew between server and client. `serverNow` on the query can be stale (queries
  // only re-run on data changes), so anchor on the turn deadline instead: it is written by
  // the server the instant a turn starts and reaches us within network latency.
  const totalTurnMs = game.config.turnSeconds * 1000;
  const skewRef = useRef<number>(data.serverNow - Date.now());
  const lastTurnKey = useRef<string | null>(null);
  {
    const key = round ? `${round._id}:${round.turnNonce}` : null;
    if (key && key !== lastTurnKey.current && round?.turnDeadline) {
      lastTurnKey.current = key;
      skewRef.current = round.turnDeadline - totalTurnMs - Date.now();
    }
  }
  const skewMs = skewRef.current;

  // ---- sizing from the measured felt
  const W = felt.w || 800;
  const H = felt.h || 500;
  const compact = W < 640 || H < 520;
  const cardWidth = Math.round(Math.max(60, Math.min(150, W / 7, H / 4.8)));
  const avatarSize = Math.round(Math.max(36, Math.min(64, H / 10)));
  const myBadge = Math.round(Math.max(20, avatarSize * 0.8 * 0.46));
  const handHeight = cardWidth * 1.42 * 0.8;
  // Keep the ellipse clear of the top bar and of the hand at the bottom.
  const ellipse: Ellipse = useMemo(() => {
    const topPad = avatarSize * 1.4 + 26;
    const bottomPad = handHeight + avatarSize * 0.4;
    const usable = Math.max(120, H - topPad - bottomPad);
    const cy = ((topPad + usable / 2) / H) * 100;
    const ry = ((usable / 2) / H) * 100;
    const rx = Math.min(45, ((W / 2 - avatarSize * 1.2) / W) * 100);
    return { cx: 50, cy, rx, ry };
  }, [W, H, avatarSize, handHeight]);

  const n = session?.seatCount ?? seats.length;
  const me = mySeat >= 0 ? seats[mySeat] : undefined;
  // A stand-in bot owns the seat: watch, do not play.
  const standIn = me?.botControlled === true;
  const isMyTurn = round !== null && round.turnSeat === mySeat && mySeat >= 0 && !display.holding && !standIn;
  const phase = round?.phase ?? "scored";
  const trump = (round?.trump ?? null) as Suit | null;
  const turnSeat = round && round.turnSeat !== null ? seats[round.turnSeat] : undefined;
  const myDeadline = isMyTurn ? (round?.turnDeadline ?? null) : null;
  // The seconds pill lives inside TableStatus; here we only make the clock audible.
  useEffect(() => {
    if (!myDeadline) return;
    sound.play("turn");
    const remaining = () => Math.max(0, myDeadline - (Date.now() + skewRef.current!));
    let cancelled = false;
    // Ticks: silent for the first stretch, then faster and sharper the less time is left.
    let tickId: number | undefined;
    const schedule = () => {
      const left = remaining();
      if (cancelled || left <= 0) return;
      const frac = left / totalTurnMs;
      const delay = frac > 0.5 ? left - totalTurnMs * 0.5 : left > 10_000 ? 2000 : left > 5_000 ? 1000 : left > 2_000 ? 500 : 250;
      tickId = window.setTimeout(() => {
        if (cancelled) return;
        const now = remaining();
        if (now < left - 1) sound.play("tick", Math.min(1, Math.max(0, 1 - now / Math.min(totalTurnMs, 15_000))));
        schedule();
      }, Math.max(60, delay));
    };
    schedule();
    return () => {
      cancelled = true;
      if (tickId) clearTimeout(tickId);
    };
  }, [myDeadline, totalTurnMs]);

  const sitOutBlock = useMemo(() => {
    if (!round || !trump || !me) return null;
    return sitOutBlockedReason({
      score: me.score,
      forcedPlayThreshold: game.config.forcedPlayThreshold,
      consecutiveSitOuts: me.sitOutStreak,
      trump,
      isTrumpNamer: round.trumpSeat === mySeat,
    });
  }, [round, trump, me, mySeat, game.config.forcedPlayThreshold]);

  const report = useCallback((err: unknown) => {
    const code = errorCode(err);
    if (RACE_CODES.includes(code)) {
      console.debug("ignored race:", code);
      return;
    }
    setError(code);
  }, []);
  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await fn();
        setSelected(new Set());
      } catch (err) {
        report(err);
      } finally {
        setBusy(false);
      }
    },
    [report],
  );

  // No warning outlives the turn it belongs to.
  useEffect(() => {
    if (!error) return;
    const id = setTimeout(() => setError(null), 4500);
    return () => clearTimeout(id);
  }, [error]);
  useEffect(() => setError(null), [roundId, roundPhase, turnSeatNow]);

  // A choice prepared while waiting is replayed the instant the turn comes round.
  const sending = useRef(false);
  useEffect(() => {
    if (!roundId || !pending || !isMyTurn || roundPhase !== "discard" || sending.current) return;
    sending.current = true;
    const choice = pending;
    void (async () => {
      try {
        if (choice.kind === "sitOut") await sitOut({ roundId });
        else await discard({ roundId, cards: choice.cards });
        setSelected(new Set());
      } catch (err) {
        report(err);
      } finally {
        setPending(null);
        sending.current = false;
      }
    })();
  }, [pending, isMyTurn, roundPhase, roundId]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxDiscard = session?.maxDiscard ?? 0;
  const toggle = useCallback(
    (card: CardT) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(card)) next.delete(card);
        else if (next.size < maxDiscard) next.add(card);
        return next;
      });
    },
    [maxDiscard],
  );
  const onPlay = useCallback(
    (card: CardT) => {
      if (!roundId) return;
      void run(() => playCard({ roundId, card }));
    },
    [roundId, run, playCard],
  );

  const openBySeat = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const h of data.openHands ?? []) map.set(h.seat, h.cards);
    return map;
  }, [data.openHands]);
  const iAmOut = me?.decision === "out";
  // Who the status card is about: the trick winner while the table holds, else the turn.
  const statusActor = display.holding && display.winnerSeat !== null ? seats[display.winnerSeat] : turnSeat;
  const statusKind: "trump" | "discard" | "tricks" | "trickWon" | null =
    display.holding && display.winnerSeat !== null
      ? "trickWon"
      : phase === "scored" || !turnSeat
        ? null
        : phase === "trump"
          ? "trump"
          : phase === "discard"
            ? "discard"
            : "tricks";
  // Discard phase, my decision still open, somebody else on the clock.
  // Before anyone decides, the seat on turn in the trump phase is the one about to.
  const trumpSeatNow = round?.trumpSeat ?? (round?.phase === "trump" ? round.turnSeat : null);
  const canPrepare =
    phase === "discard" && mySeat >= 0 && !standIn && me?.decision === "pending" && !isMyTurn && Boolean(trump);

  const winnerName = game.winnerPlayerId ? seats.find((s) => s.playerId === game.winnerPlayerId)?.name ?? null : null;
  const gameOver = game.status === "finished";
  const tricksStarted = phase === "tricks" || phase === "scored";
  const layout = ringLayout(n, (seat) => !tricksStarted || seats[seat]?.decision !== "out");
  const placer = ringPlacer(layout, mySeat, ellipse);
  const satOut = tricksStarted ? seats.filter((s) => s.decision === "out") : [];
  const liveLeader =
    round && !display.holding && trump && round.currentTrick.plays.length > 0
      ? (currentWinner(round.currentTrick.plays as { seat: number; card: CardT }[], trump, game.config.deck)?.seat ?? null)
      : null;
  const leadingSeat = display.holding ? display.winnerSeat : liveLeader;
  // Trump/discard panels: centred in the ellipse on wide screens; on compact/portrait
  // screens they sit just above the hand, where the side seats cannot be covered.
  const portrait = H > W;
  const panelStyle: React.CSSProperties =
    compact || portrait
      ? { bottom: handHeight + avatarSize * 0.35 }
      : { top: `${ellipse.cy}%`, transform: "translateY(-50%)" };
  const goRematch = () =>
    void run(async () => {
      const { gameId: next } = await rematch({ gameId: game._id });
      await navigate({ to: "/g/$gameId", params: { gameId: next } });
    });

  // Ending the sitting is a table decision, so it lives where the table is: anyone seated
  // may call time, plus whoever opened it and the table owner.
  const canEndSitting =
    game.mode === "campaign" && session?.status === "active" && game.status !== "finished" && (data.isOwner || mySeat >= 0);
  const goEndSitting = () => {
    if (!window.confirm(t("table.endSessionConfirm"))) return;
    void run(async () => {
      await closeSitting({ gameId: game._id });
      await navigate({ to: "/g/$gameId", params: { gameId: game._id } });
    });
  };

  const isCampaign = game.mode === "campaign";
  const goAbandon = () => {
    if (!window.confirm(t(isCampaign ? "table.abandonConfirmCampaign" : "table.abandonConfirm"))) return;
    void run(async () => {
      await abandonSeat({ gameId: game._id });
      await navigate({ to: "/g/$gameId", params: { gameId: game._id } });
    });
  };

  return (
    <LayoutGroup>
      <div className="fixed inset-0 z-40 flex flex-col bg-felt-900">
        {/* top bar */}
        <div className="flex h-11 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-white/10 bg-black/40 px-2 text-xs text-cream-100/80 sm:gap-3 sm:px-3 sm:text-sm">
          <Link to="/" className="rounded-md px-2 py-1 font-semibold text-gold-400 hover:bg-white/10" aria-label={t("table.home")} title={t("table.home")}>
            ♠
          </Link>
          <button
            type="button"
            onClick={() => setDrawer("lobby")}
            className="rounded-md px-2 py-1 font-semibold text-cream-50 hover:bg-white/10"
            aria-label={t("table.backToLobby")}
            title={t("table.backToLobby")}
          >
            ←
          </button>
          <span className="hidden max-w-[14rem] truncate font-display font-bold text-cream-50 lg:inline">{game.name}</span>
          {round && <span className="whitespace-nowrap font-semibold text-cream-50">{t("table.round", { n: round.index + 1 })}</span>}
          {session && <span className="hidden whitespace-nowrap lg:inline">{t("table.cap", { cap: session.maxDiscard })}</span>}
          {trump ? (
            <span className={`flex items-center gap-1 rounded-md bg-cream-50 px-1.5 py-0.5 font-bold ${trump === "H" || trump === "D" ? "text-heart" : "text-ink-900"}`}>
              <span className="text-base leading-none">{SUIT_SYMBOLS[trump]}</span>
              <span className="hidden sm:inline">{t(`suits.${trump}`).split(" ")[0]}</span>
              {flippedCard && <span className="rounded bg-ink-900 px-1 text-[10px] text-white" title={t("table.flippedCard")}>⤺</span>}
              {trump === "H" && (
                <span className={`rounded px-1 text-[10px] font-bold text-white ${isDark ? "bg-heart ring-1 ring-cream-50" : "bg-heart"}`}>
                  {isDark ? "×4" : "×2"}
                </span>
              )}
              {trump === "C" && <span className="rounded bg-ink-900 px-1 text-[10px] text-white">!</span>}
            </span>
          ) : (
            <span className="whitespace-nowrap text-cream-100/50">{t("table.noTrump")}</span>
          )}
          <nav className="ml-auto flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setDrawer("lobby")} className="rounded-md px-2 py-1 hover:bg-white/10">
              {t("tabs.lobby")}
            </button>
            <button type="button" onClick={() => setDrawer("standings")} className="rounded-md px-2 py-1 hover:bg-white/10">
              {t("tabs.standings")}
            </button>
            <button type="button" onClick={() => setDrawer("history")} className="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline">
              {t("tabs.history")}
            </button>
            {canEndSitting && (
              <button
                type="button"
                onClick={goEndSitting}
                disabled={busy}
                className="hidden rounded-md px-2 py-1 text-cream-100/70 hover:bg-white/10 hover:text-gold-400 lg:inline"
              >
                {t("table.endSession")}
              </button>
            )}
            {mySeat >= 0 && !standIn && game.status !== "finished" && (
              <button
                type="button"
                onClick={goAbandon}
                disabled={busy}
                className="hidden rounded-md px-2 py-1 text-cream-100/60 hover:bg-white/10 hover:text-heart lg:inline"
              >
                {t(isCampaign ? "table.abandonCampaign" : "table.abandon")}
              </button>
            )}
            <button
              type="button"
              onClick={() => soundSettings.setSfx(!soundSettings.sfx)}
              aria-pressed={soundSettings.sfx}
              title={t("table.sfx")}
              className={`rounded-md px-2 py-1 hover:bg-white/10 ${soundSettings.sfx ? "text-cream-50" : "text-cream-100/40"}`}
            >
              {soundSettings.sfx ? "🔊" : "🔇"}
            </button>
            <button
              type="button"
              onClick={() => soundSettings.setMusic(!soundSettings.music)}
              aria-pressed={soundSettings.music}
              title={t("table.music")}
              className={`rounded-md px-2 py-1 hover:bg-white/10 ${soundSettings.music ? "text-cream-50" : "text-cream-100/40"}`}
            >
              ♪
            </button>
            <LanguageToggle />
          </nav>
        </div>

        {/* felt */}
        <div ref={felt.ref} className="perspective relative flex-1 overflow-hidden">
          <div className="felt absolute inset-0" />
          {isMyTurn && round?.turnDeadline && (
            <div
              key={`${round._id}-${round.turnNonce}`}
              className="turn-bar absolute inset-x-0 top-0 z-30 h-1.5"
              style={{ animationDuration: `${Math.max(0, round.turnDeadline - (Date.now() + skewMs))}ms` }}
            />
          )}
          <div
            className="absolute rounded-[50%] border-2 border-white/10 shadow-[inset_0_0_80px_rgba(0,0,0,0.35)]"
            style={{
              left: `${ellipse.cx - ellipse.rx}%`,
              top: `${ellipse.cy - ellipse.ry}%`,
              width: `${ellipse.rx * 2}%`,
              height: `${ellipse.ry * 2}%`,
            }}
          />

          {seats
            .filter((s) => layout.includes(s.seat) && !s.isMe)
            .map((s) => {
              const pos = placer.seat(s.seat);
              return (
                <Seat
                  key={s.seat}
                  seat={s}
                  x={pos.x}
                  y={pos.y}
                  isTrumpSeat={trumpSeatNow === s.seat}
                  flipped={flippedCard !== null}
                  isTurn={round?.turnSeat === s.seat && phase !== "scored"}
                  deadline={round?.turnDeadline ?? null}
                  totalMs={game.config.turnSeconds * 1000}
                  skewMs={skewMs}
                  phase={phase}
                  compact={compact}
                  size={avatarSize}
                  openHand={openBySeat.get(s.seat) ?? null}
                  deck={game.config.deck}
                  trump={trump}
                />
              );
            })}

          <div className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-2">
            <AnimatePresence mode="wait">
              <TableStatus
                actor={statusActor}
                kind={statusKind}
                isMe={statusKind !== "trickWon" && isMyTurn}
                deadline={statusKind === "trickWon" ? null : round?.turnDeadline ?? null}
                totalMs={totalTurnMs}
                skewMs={skewMs}
                compact={compact}
              />
            </AnimatePresence>
          </div>

          <TrickArea
            plays={phase === "scored" && !display.holding ? [] : display.plays}
            leadingSeat={leadingSeat}
            holding={display.holding}
            collecting={display.collecting}
            placer={placer}
            cardWidth={Math.round(cardWidth * 0.78)}
          />

          {/* Kept clear of the status card, which is centred at the top of the felt. */}
          <div className="absolute left-2 z-20 flex max-w-[45%] flex-col items-start gap-2" style={{ top: compact ? 54 : 8 }}>
            {satOut.length > 0 && (
              <div className="rounded-xl bg-black/40 px-3 py-2 text-xs text-cream-100/80">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cream-100/50">{t("table.satOutList")}</p>
                {satOut.map((s) => (
                  <div key={s.seat} className="flex items-center gap-1.5 opacity-80">
                    <span className="h-2 w-2 rounded-full bg-zinc-400" />
                    {s.isMe ? t("common.you") : s.name}
                    <span className="font-mono text-cream-100/60">{s.score}</span>
                  </div>
                ))}
              </div>
            )}
            <TrickHistory tricks={(round?.completedTricks ?? []) as PlayedTrick[]} seats={seats} compact={compact} />
          </div>

          <AnimatePresence>
            {reveal && round && (
              <motion.div key={reveal.roundId} className="absolute inset-0 z-30 flex items-center justify-center" exit={{ opacity: 0 }}>
                <TrumpReveal
                  trump={reveal.suit}
                  byName={(round.trumpSeat !== null ? seats[round.trumpSeat]?.name : undefined) ?? seats[(round.dealerSeat + 1) % n]?.name ?? ""}
                  flipped={flippedCard}
                  dark={isDark}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {isMyTurn && phase === "trump" && blindDeadline !== null && !reveal && (
            <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
              <DarkCall
                deadline={blindDeadline}
                skewMs={skewMs}
                busy={busy}
                compact={compact}
                onCall={() => void run(() => darkHearts({ roundId: round._id }))}
                onSkip={() => void run(() => revealHand({ roundId: round._id }))}
              />
            </div>
          )}
          {isMyTurn && phase === "trump" && blindDeadline === null && !reveal && (
            <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
              <TrumpPicker
                busy={busy}
                compact={compact}
                onPick={(suit) => void run(() => nameTrump({ roundId: round._id, suit }))}
                onFlip={() => void run(() => flipTrump({ roundId: round._id }))}
              />
            </div>
          )}
          {canPrepare && session && !reveal && (
            <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
              <DiscardPanel
                compact={compact}
                prepare
                pending={pending}
                onClear={() => setPending(null)}
                cap={session.maxDiscard}
                trump={trump ?? "S"}
                flipped={flippedCard}
                youFlipped={flippedCard !== null && round?.trumpSeat === mySeat}
                selectedCount={selected.size}
                sitOutBlock={sitOutBlock}
                threshold={game.config.forcedPlayThreshold}
                busy={busy}
                onDiscard={() => setPending({ kind: "discard", cards: [...selected] })}
                onSitOut={() => setPending({ kind: "sitOut" })}
              />
            </div>
          )}
          {isMyTurn && phase === "discard" && session && !reveal && (
            <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
              <DiscardPanel
                compact={compact}
                cap={session.maxDiscard}
                trump={trump ?? "S"}
                flipped={flippedCard}
                youFlipped={flippedCard !== null && round?.trumpSeat === mySeat}
                selectedCount={selected.size}
                sitOutBlock={sitOutBlock}
                threshold={game.config.forcedPlayThreshold}
                busy={busy}
                onDiscard={() => void run(() => discard({ roundId: round._id, cards: [...selected] }))}
                onSitOut={() => void run(() => sitOut({ roundId: round._id }))}
              />
            </div>
          )}

          {/* my seat chip + hand, pinned to the bottom of the felt */}
          {me && (
            <div
              className={`absolute left-2 z-20 flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs text-cream-50 ${isMyTurn ? "bg-gold-400/25 ring-2 ring-gold-400" : "bg-black/45"}`}
              style={{ bottom: compact || portrait ? handHeight + 10 : 8 }}
            >
              <div className="relative" style={{ width: avatarSize * 0.8, height: avatarSize * 0.8 }}>
                <Avatar seed={me.avatarSeed} size={avatarSize * 0.8} className={me.decision === "out" ? "opacity-50 grayscale" : ""} />
                {isMyTurn && round?.turnDeadline && (
                  <TimerRing deadline={round.turnDeadline} totalMs={game.config.turnSeconds * 1000} size={avatarSize * 0.8} skewMs={skewMs} />
                )}
                {trumpSeatNow === mySeat && (
                  <span
                    className={`absolute -right-1.5 -top-1.5 flex items-center justify-center rounded-full bg-cream-50 font-bold shadow-md ring-2 ${
                      trump ? "ring-gold-400" : "ring-gold-400/60"
                    } ${trump === "H" || trump === "D" ? "text-heart" : "text-ink-900"}`}
                    style={{ width: myBadge, height: myBadge, fontSize: Math.round(myBadge * 0.66), lineHeight: 1 }}
                    title={trump ? t(flippedCard ? "table.flippedTrumpBadge" : "table.setTrumpBadge") : t("table.choosingTrumpBadge")}
                  >
                    {trump ? SUIT_SYMBOLS[trump] : "?"}
                  </span>
                )}
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-1.5 font-semibold">
                  {t("common.you")}
                  {standIn && (
                    <span
                      className="rounded bg-white/15 px-1 text-[10px] font-semibold text-cream-100/80"
                      title={me?.botReason ? t(`table.botReason.${me.botReason}`, { name: t("common.you") }) : undefined}
                    >
                      {t("table.botStandIn")}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="rounded bg-cream-100 px-1.5 font-mono font-bold text-ink-900">{me.score}</span>
                  {me.tricksWon > 0 && (
                    <span
                      className="inline-flex items-center justify-center rounded-full bg-gold-400 font-bold text-ink-900 shadow-md ring-2 ring-ink-900/25"
                      style={{ width: myBadge, height: myBadge, fontSize: Math.round(myBadge * 0.6), lineHeight: 1 }}
                      title={t("table.tricksWonBadge", { n: me.tricksWon })}
                    >
                      {me.tricksWon}
                    </span>
                  )}
                  {me.decision === "out" && phase !== "scored" && <span className="text-cream-100/70">{t("table.out")}</span>}
                  {phase === "scored" && me.delta !== undefined && (
                    <span className={`rounded px-1 font-bold ${me.delta < 0 ? "bg-emerald-400 text-ink-900" : me.delta > 0 ? "bg-heart text-white" : "bg-black/40"}`}>
                      {me.delta > 0 ? `+${me.delta}` : me.delta}
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {mySeat >= 0 && myHand && iAmOut && tricksStarted ? (
            <p className="absolute inset-x-0 bottom-4 text-center text-sm text-cream-100/70">
              {t("table.youSatOut")} {openBySeat.size > 0 && <span className="text-gold-400">{t("table.watchingHands")}</span>}
            </p>
          ) : mySeat >= 0 && myHand ? (
            <div className="absolute inset-x-0 z-10" style={{ bottom: -cardWidth * (compact ? 0.14 : 0.3) }}>
              <HandFan
                hand={myHand as CardT[]}
                deck={game.config.deck}
                trump={trump}
                trick={(round?.currentTrick as TrickInProgress | undefined) ?? null}
                canPlay={isMyTurn && phase === "tricks" && me?.decision === "in"}
                selectable={phase === "discard" && me?.decision === "pending" && pending === null}
                selected={selected}
                onToggle={toggle}
                onPlay={onPlay}
                cardWidth={cardWidth}
                maxWidth={W * 0.92}
              />
            </div>
          ) : data.inTheDark ? (
            <div className="absolute inset-x-0 z-10 flex justify-center gap-2" style={{ bottom: 10 }} aria-hidden>
              {[0, 1, 2].map((i) => (
                <CardBack key={i} width={cardWidth * 0.8} style={{ transform: `rotate(${(i - 1) * 5}deg)` }} />
              ))}
            </div>
          ) : (
            <p className="absolute inset-x-0 bottom-3 text-center text-sm text-cream-100/60">{t("table.spectating")}</p>
          )}

          <AnimatePresence>
            {error && (
              <motion.div
                key={error}
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 12, opacity: 0 }}
                className="absolute inset-x-0 z-30 flex justify-center px-3"
                style={{ bottom: handHeight + 8 }}
              >
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="max-w-md rounded-xl border border-heart/60 bg-black/80 px-4 py-2 text-center text-sm font-medium text-cream-50 shadow-xl backdrop-blur"
                >
                  {t(`table.illegal.${error}`, { defaultValue: t(`errors.${error}`, { defaultValue: error }) })}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <Drawer open={drawer === "lobby"} title={t("tabs.lobby")} onClose={() => setDrawer(null)}>
          <LobbyView gameId={game._id} embedded />
        </Drawer>
        <Drawer open={drawer === "standings"} title={t("tabs.standings")} onClose={() => setDrawer(null)}>
          <StandingsView gameId={game._id} />
        </Drawer>
        <Drawer open={drawer === "history"} title={t("tabs.history")} onClose={() => setDrawer(null)}>
          <HistoryView gameId={game._id} />
        </Drawer>

        {round && phase === "scored" && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <RoundResult
              seats={seats}
              trump={trump}
              dark={isDark}
              winnerName={winnerName}
              gameOver={gameOver}
              onBack={() => void navigate({ to: "/g/$gameId", params: { gameId: game._id } })}
              isOwner={data.isOwner}
              hasRematch={Boolean(game.rematchGameId)}
              onRematch={goRematch}
              busy={busy}
            />
          </div>
        )}
      </div>
    </LayoutGroup>
  );
}
