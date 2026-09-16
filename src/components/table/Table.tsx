import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { CLASSIC_RULES, POWERUPS_ENABLED, type Card as CardT, type Powerup, type Suit, SUIT_SYMBOLS, type TrickInProgress, currentWinner, partyRules, sitOutBlockedReason } from "@/engine";
import { errorCode } from "@/lib/errors";
import { useTrickDisplay } from "@/hooks/useTrickDisplay";
import { useElementSize } from "@/hooks/useElementSize";
import { useReveals } from "@/hooks/useReveals";
import { useTurnClock } from "@/hooks/useTurnClock";
import { useTableSounds } from "@/hooks/useTableSounds";
import { useFeltLayout } from "@/hooks/useFeltLayout";
import { Avatar } from "@/components/ui/Avatar";
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
import { type DrawerName, TableBar } from "./TableBar";
import type { PartyView } from "./party";
import { TrumpPicker, TrumpReveal } from "./TrumpPanels";
import { type PendingChoice, DiscardPanel } from "./DiscardPanel";
import { CoinFlip, TwistBanner, TwistReveal } from "./PartyReveals";
import { DummyPanel, MarketPanel, PassPanel, PowerupTray } from "./PartyPanels";
import { RoundResult } from "./RoundResult";
import { ringLayout, ringPlacer } from "./geometry";

export type TableData = NonNullable<FunctionReturnType<typeof api.game.table.get>>;
type SeatRow = TableData["seats"][number] & { online: boolean };

/**
 * Codes that only ever mean "the table moved on between the click and the mutation
 * landing". The UI has already corrected itself, so a banner would just be noise.
 */
const RACE_CODES = ["notYourTurn", "wrongPhase", "alreadyDecided"];

/**
 * Full-viewport table. A thin bar on top, the felt fills the rest; every size (cards,
 * avatars, ellipse) derives from the measured felt so it works from phones to ultrawides.
 *
 * What the table shows comes straight from the server's view of the round. What it adds
 * on top lives in hooks of its own: the centre-felt announcements (useReveals), the turn
 * clock (useTurnClock), the sound cues (useTableSounds) and the geometry (useFeltLayout).
 */
export function Table({ data }: { data: TableData }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { game, session, round, seats: seatRows, mySeat, myHand } = data;
  // Presence is its own subscription so a heartbeat cannot invalidate the table query
  // and re-send every hand and trick. See presence.onlineIn.
  const onlineIds = useQuery(api.presence.onlineIn, { gameId: game._id });
  // Keyed on the joined ids rather than the array: a heartbeat that changes nothing hands
  // back a fresh array every time, and reseating everyone for that would defeat the point.
  const onlineKey = (onlineIds ?? []).join(",");
  // Every query update arrives as fresh objects. A seat whose data has not changed keeps
  // the object it had, so the memoised Seat components only re-render for the seats that
  // actually moved: the one on turn and the one that just played, not all eight.
  const [seatCache] = useState(() => new Map<number, { key: string; view: SeatRow }>());
  const seats = useMemo(() => {
    const online = new Set(onlineKey === "" ? [] : onlineKey.split(","));
    return seatRows.map((s) => {
      const view: SeatRow = { ...s, online: s.isBot || (s.userId !== null && online.has(s.userId)) };
      const key = JSON.stringify(view);
      const kept = seatCache.get(s.seat);
      if (kept && kept.key === key) return kept.view;
      seatCache.set(s.seat, { key, view });
      return view;
    });
  }, [seatRows, onlineKey, seatCache]);
  const nameTrump = useMutation(api.game.actions.nameTrump);
  const flipTrump = useMutation(api.game.actions.flipTrump);
  const darkHearts = useMutation(api.game.actions.darkHearts);
  const revealHand = useMutation(api.game.actions.revealHand);
  const discard = useMutation(api.game.actions.discard);
  const sitOut = useMutation(api.game.actions.sitOut);
  const playCard = useMutation(api.game.actions.playCard);
  const passCards = useMutation(api.game.actions.passCards);
  const takeCard = useMutation(api.game.actions.takeCard);
  const dummySwap = useMutation(api.game.actions.dummySwap);
  const [dummyTake, setDummyTake] = useState<CardT | null>(null);
  const spendPowerup = useMutation(api.game.actions.usePowerup);
  const rematch = useMutation(api.games.rematch);
  const abandonSeat = useMutation(api.games.abandonSeat);
  const closeSitting = useMutation(api.sessions.close);
  const [selected, setSelected] = useState<Set<CardT>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingChoice | null>(null);
  const [drawer, setDrawer] = useState<DrawerName | null>(null);
  const [feltRef, felt] = useElementSize<HTMLDivElement>();

  // Party: the round's twist and the public trace of powerups. Null on a classic table.
  const party: PartyView | null = (round?.party as unknown as PartyView | null | undefined) ?? null;
  const rules = party ? partyRules(party) : CLASSIC_RULES;
  const goldenTrump = party !== null && party.twist === "golden" && party.goldenSuit !== null && party.goldenSuit === round?.trump;

  const roundId = round?._id;
  const roundPhase = round?.phase;
  const turnSeatNow = round?.turnSeat ?? null;
  // Selection and any prepared choice belong to one round + phase, not to one turn: a
  // player picks cards while others are still deciding.
  useEffect(() => {
    setSelected(new Set());
    setPending(null);
    setDummyTake(null);
  }, [roundId, roundPhase]);

  const roundTrump = round?.trump ?? null;
  const namerSeat = round?.trumpSeat ?? (round && session ? (round.dealerSeat + 1) % session.seatCount : -1);
  const flippedCard = round?.flipped ?? null;
  const isDark = round?.darkHearts === true;
  // The server is still holding this seat's cards back, so the blind offer stands.
  const blindDeadline = data.inTheDark ? round?.darkUntil ?? null : null;
  const reveal = useReveals({
    roundId,
    roundPhase,
    roundOpening: round !== null && (round.phase === "trump" || (round.phase === "discard" && seatRows.every((s) => s.decision === "pending"))),
    trump: roundTrump,
    namerSeat,
    mySeat,
    flipped: flippedCard,
    twist: party?.twist ?? null,
    swapped: party?.swapped ?? null,
  });

  const display = useTrickDisplay(
    round ? { _id: round._id, currentTrick: round.currentTrick as TrickInProgress, completedTricks: round.completedTricks as never } : null,
  );

  // A party twist may shorten the clock or cap the discards for this round only.
  const totalTurnMs = (rules.turnSeconds ?? game.config.turnSeconds) * 1000;
  const maxDiscardNow = rules.maxDiscard ?? session?.maxDiscard ?? 0;
  const { skewMs, turnBarMs } = useTurnClock({ roundId, turnNonce: round?.turnNonce, turnDeadline: round?.turnDeadline, totalTurnMs });

  const n = session?.seatCount ?? seats.length;
  const me = mySeat >= 0 ? seats[mySeat] : undefined;
  // A stand-in bot owns the seat: watch, do not play.
  const standIn = me?.botControlled === true;
  const isMyTurn = round !== null && round.turnSeat === mySeat && mySeat >= 0 && !display.holding && !standIn;
  const phase = round?.phase ?? "scored";
  const trump = (round?.trump ?? null) as Suit | null;
  const turnSeat = round && round.turnSeat !== null ? seats[round.turnSeat] : undefined;
  const myDeadline = isMyTurn ? (round?.turnDeadline ?? null) : null;
  useTableSounds({
    roundId,
    playCount: round?.currentTrick.plays.length ?? 0,
    trickCount: round?.completedTricks.length ?? 0,
    lastTrick: round?.completedTricks[round.completedTricks.length - 1],
    mySeat,
    phase: round?.phase,
    winnerSeat: round?.winnerSeat ?? null,
    holding: display.holding,
    reveal,
    myDeadline,
    totalTurnMs,
    skewMs,
  });

  // Whether this viewer has a hand along the bottom edge. Spectators and players who sat
  // out do not, and they are the ones shown the other hands face up.
  const sittingOut = mySeat >= 0 && seats[mySeat]?.decision === "out" && (round?.phase === "tricks" || round?.phase === "scored");
  const handShown = mySeat >= 0 && myHand !== null && !sittingOut;
  // The status card normally hangs from the top of the felt, right over the seat opposite.
  // With face-up hands there that covers the cards, so it moves to the free bottom edge.
  const statusBelow = !handShown && !data.inTheDark;
  const { W, compact, portrait, cardWidth, avatarSize, myBadge, handHeight, statusBottom, ellipse, panelStyle } = useFeltLayout({
    felt,
    statusBelow,
    hasOpenHands: (data.openHands?.length ?? 0) > 0,
    hasFaceUp: party?.twist === "faceUp" && round?.phase === "tricks",
  });

  const sitOutBlock = useMemo(() => {
    if (!round || round.phase === "trump" || !me) return null;
    return sitOutBlockedReason({
      score: me.score,
      forcedPlayThreshold: game.config.forcedPlayThreshold,
      consecutiveSitOuts: me.sitOutStreak,
      trump,
      isTrumpNamer: round.trumpSeat === mySeat,
      allIn: rules.allIn,
    });
  }, [round, trump, me, mySeat, game.config.forcedPlayThreshold, rules.allIn]);

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

  // Passing takes exactly the twist's count (one for the market), a dummy swap one card,
  // and discarding up to the cap.
  const selectLimit = roundPhase === "pass" ? (rules.market ? 1 : rules.pass?.count ?? 1) : roundPhase === "dummy" ? 1 : maxDiscardNow;
  const toggle = useCallback(
    (card: CardT) => {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(card)) next.delete(card);
        else if (next.size < selectLimit) next.add(card);
        return next;
      });
    },
    [selectLimit],
  );
  const onPlay = useCallback(
    (card: CardT) => {
      if (!roundId) return;
      void run(() => playCard({ roundId, card }));
    },
    [roundId, run, playCard],
  );
  const onUsePowerup = useCallback(
    (powerup: Powerup, target?: number) => {
      if (!roundId) return;
      void run(() => spendPowerup(target === undefined ? { roundId, powerup } : { roundId, powerup, target }));
    },
    [roundId, run, spendPowerup],
  );
  const peekedSeats = useMemo(() => new Set(party?.peeks.filter((k) => k.seat === mySeat).map((k) => k.target) ?? []), [party, mySeat]);
  const myWard = data.myWard ?? null;

  const openBySeat = useMemo(() => {
    const map = new Map<number, string[]>();
    for (const h of data.openHands ?? []) map.set(h.seat, h.cards);
    return map;
  }, [data.openHands]);
  const iAmOut = me?.decision === "out";
  // Who the status card is about: the trick winner while the table holds, else the turn.
  const statusActor = display.holding && display.winnerSeat !== null ? seats[display.winnerSeat] : turnSeat;
  const statusKind: "trump" | "discard" | "pass" | "market" | "dummy" | "tricks" | "trickWon" | null =
    display.holding && display.winnerSeat !== null
      ? "trickWon"
      : phase === "scored" || !turnSeat
        ? null
        : phase === "trump"
          ? "trump"
          : phase === "discard"
            ? "discard"
            : phase === "pass" || phase === "market" || phase === "dummy"
              ? phase
              : "tricks";
  // Discard phase, my decision still open, somebody else on the clock.
  // Before anyone decides, the seat on turn in the trump phase is the one about to.
  const trumpSeatNow = rules.noTrump ? null : round?.trumpSeat ?? (round?.phase === "trump" ? round.turnSeat : null);
  const canPrepare =
    phase === "discard" && mySeat >= 0 && !standIn && me?.decision === "pending" && !isMyTurn && (Boolean(trump) || rules.noTrump);

  const winnerName = game.winnerPlayerId ? seats.find((s) => s.playerId === game.winnerPlayerId)?.name ?? null : null;
  const gameOver = game.status === "finished";
  const tricksStarted = phase === "tricks" || phase === "scored";
  const layout = ringLayout(n, (seat) => !tricksStarted || seats[seat]?.decision !== "out");
  const placer = ringPlacer(layout, mySeat, ellipse);
  const satOut = tricksStarted ? seats.filter((s) => s.decision === "out") : [];
  const liveLeader =
    round && !display.holding && round.currentTrick.plays.length > 0
      ? (currentWinner(round.currentTrick.plays as { seat: number; card: CardT }[], trump, game.config.deck, rules.lowWins, rules.wildRank)?.seat ?? null)
      : null;
  const leadingSeat = display.holding ? display.winnerSeat : liveLeader;
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
    <div className="fixed inset-0 z-40 flex flex-col bg-felt-900">
      <TableBar
        gameName={game.name}
        roundIndex={round ? round.index : null}
        cap={session ? maxDiscardNow : null}
        trump={trump}
        flipped={flippedCard !== null}
        dark={isDark}
        goldenTrump={goldenTrump}
        party={party}
        busy={busy}
        canEndSitting={canEndSitting}
        onEndSitting={goEndSitting}
        canAbandon={mySeat >= 0 && !standIn && game.status !== "finished"}
        isCampaign={isCampaign}
        onAbandon={goAbandon}
        onOpen={setDrawer}
      />

      {/* felt */}
      <div ref={feltRef} className="perspective relative flex-1 overflow-hidden">
        <div className="felt absolute inset-0" />
        {isMyTurn && round?.turnDeadline && (
          <div
            key={`${round._id}-${round.turnNonce}`}
            className="turn-bar absolute inset-x-0 top-0 z-30 h-1.5"
            style={{ animationDuration: `${turnBarMs}ms` }}
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
                totalMs={totalTurnMs}
                skewMs={skewMs}
                phase={phase}
                compact={compact}
                size={avatarSize}
                openHand={openBySeat.get(s.seat) ?? null}
                deck={game.config.deck}
                trump={trump}
                cursed={party?.curses[s.seat] ?? 0}
                shielded={party?.shielded[s.seat] ?? false}
                peeked={peekedSeats.has(s.seat)}
                ward={myWard === s.seat}
                faceUp={phase === "tricks" ? party?.faceUp[s.seat] ?? null : null}
              />
            );
          })}

        {/* Whose turn it is, and who took the trick, are the two things a player who
            cannot see the felt has to be told. Polite, so it waits for a pause. */}
        <div
          className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-2"
          style={statusBelow ? { bottom: statusBottom } : { top: 8 }}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
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

        {/* Kept clear of the status card when it is centred at the top of the felt. */}
        <div className="absolute left-2 z-20 flex max-w-[45%] flex-col items-start gap-2" style={{ top: compact && !statusBelow ? 54 : 8 }}>
          {party && phase !== "scored" && <TwistBanner party={party} compact={compact} />}
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

        <AnimatePresence mode="wait">
          {reveal && round && (
            <motion.div
              key={`${reveal.roundId}-${reveal.kind}`}
              className="absolute inset-0 z-30 flex items-center justify-center px-3"
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {reveal.kind === "trump" ? (
                <TrumpReveal
                  trump={reveal.suit}
                  byName={(round.trumpSeat !== null ? seats[round.trumpSeat]?.name : undefined) ?? seats[(round.dealerSeat + 1) % n]?.name ?? ""}
                  flipped={flippedCard}
                  dark={isDark}
                />
              ) : reveal.kind === "coin" ? (
                <CoinFlip swapped={reveal.swapped} compact={compact} />
              ) : (
                party && <TwistReveal party={party} compact={compact} />
              )}
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
              cap={maxDiscardNow}
              trump={trump}
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
              cap={maxDiscardNow}
              trump={trump}
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
        {isMyTurn && phase === "pass" && party && (
          <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
            <PassPanel
              compact={compact}
              market={rules.market}
              spec={rules.pass ?? { count: 1, direction: "left" }}
              targetName={(() => {
                // The cards travel round the ring of seats still in, clockwise from the
                // dealer's left, by the twist's offset.
                const ring: number[] = [];
                for (let i = 1; i <= n; i++) {
                  const seat = (round.dealerSeat + i) % n;
                  if (seats[seat]?.decision === "in") ring.push(seat);
                }
                const at = ring.indexOf(mySeat);
                if (at < 0 || !rules.pass) return "";
                const off = rules.pass.direction === "left" ? 1 : rules.pass.direction === "right" ? ring.length - 1 : Math.floor(ring.length / 2);
                return seats[ring[(at + off) % ring.length]!]?.name ?? "";
              })()}
              selected={[...selected]}
              busy={busy}
              onPass={() => void run(() => passCards({ roundId: round._id, cards: [...selected] }))}
            />
          </div>
        )}
        {phase === "market" && party && round && mySeat >= 0 && !standIn && me?.decision === "in" && (
          <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
            <MarketPanel
              compact={compact}
              cards={party.market as CardT[]}
              mine={isMyTurn}
              busy={busy}
              onTake={(card) => void run(() => takeCard({ roundId: round._id, card }))}
            />
          </div>
        )}
        {phase === "dummy" && party && round && mySeat >= 0 && !standIn && me?.decision === "in" && (
          <div className="absolute inset-x-0 z-20 flex justify-center px-3" style={panelStyle}>
            <DummyPanel
              compact={compact}
              cards={party.dummy as CardT[]}
              mine={isMyTurn}
              give={[...selected][0] ?? null}
              take={dummyTake}
              busy={busy}
              onPickTake={(card) => setDummyTake((cur) => (cur === card ? null : card))}
              onSwap={() => {
                const give = [...selected][0];
                if (give && dummyTake) void run(() => dummySwap({ roundId: round._id, give, take: dummyTake }));
              }}
              onSkip={() => void run(() => dummySwap({ roundId: round._id }))}
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
                <TimerRing deadline={round.turnDeadline} totalMs={totalTurnMs} size={avatarSize * 0.8} skewMs={skewMs} />
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
                {party && (party.curses[mySeat] ?? 0) > 0 && (
                  <span className="rounded bg-purple-700/80 px-1 text-[10px] font-bold text-white" title={t("party.cursed")}>☠</span>
                )}
                {party?.shielded[mySeat] && <span className="rounded bg-sky-700/80 px-1 text-[10px] text-white" title={t("party.shielded")}>🛡</span>}
                {myWard !== null && seats[myWard] && (
                  <span className="rounded bg-gold-400 px-1 text-[10px] font-semibold text-ink-900" title={t("party.wardHint")}>
                    🛡 {t("party.guarding", { name: seats[myWard]!.name })}
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

        {POWERUPS_ENABLED && party && me && !standIn && me.decision !== "out" && (phase === "discard" || phase === "tricks") && data.myPowerups.length > 0 && (
          <div className="absolute right-2 z-20" style={{ bottom: compact || portrait ? handHeight + 10 : 8 }}>
            <PowerupTray
              stash={data.myPowerups as Powerup[]}
              targets={seats.filter((s) => s.seat !== mySeat && s.decision !== "out")}
              shielded={party.shielded[mySeat] ?? false}
              busy={busy}
              onUse={onUsePowerup}
              compact={compact}
            />
          </div>
        )}

        {mySeat >= 0 && myHand && iAmOut && tricksStarted ? (
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-cream-100/70">
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
              selectable={(phase === "discard" && maxDiscardNow > 0 && me?.decision === "pending" && pending === null) || ((phase === "pass" || phase === "dummy") && isMyTurn)}
              selected={selected}
              onToggle={toggle}
              onPlay={onPlay}
              cardWidth={cardWidth}
              maxWidth={W * 0.92}
              rules={rules}
            />
          </div>
        ) : data.inTheDark ? (
          <div className="absolute inset-x-0 z-10 flex justify-center gap-2" style={{ bottom: 10 }} aria-hidden>
            {[0, 1, 2].map((i) => (
              <CardBack key={i} width={cardWidth * 0.8} style={{ transform: `rotate(${(i - 1) * 5}deg)` }} />
            ))}
          </div>
        ) : (
          <p className="absolute inset-x-0 bottom-2 text-center text-sm text-cream-100/60">
            {openBySeat.size > 0 ? <span className="text-gold-400">{t("table.spectatorHands")}</span> : t("table.spectating")}
          </p>
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
              role="alert"
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

      {/* Not before the fifth trick has had its moment on the felt: the result card would
          otherwise cover the card that decided the round before anyone had read it. */}
      {round && phase === "scored" && !display.holding && (
        <div
          className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-black/55 p-4 ${gameOver ? "items-start" : "items-center"}`}
        >
          <div className={`w-full space-y-3 ${gameOver ? "max-w-3xl" : "max-w-md"}`}>
          <RoundResult
            seats={seats}
            trump={trump}
            dark={isDark}
            party={party}
            winnerName={winnerName}
            gameOver={gameOver}
            onBack={() => void navigate({ to: "/g/$gameId", params: { gameId: game._id } })}
            isOwner={data.isOwner}
            hasRematch={Boolean(game.rematchGameId)}
            onRematch={goRematch}
            busy={busy}
          />
          {/* The final round alone does not say how the game went: show the classification. */}
          {gameOver && <StandingsView gameId={game._id} readOnly />}
          </div>
        </div>
      )}
    </div>
  );
}
