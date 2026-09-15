import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MIN_SEATS, discardCapFor } from "@/engine";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { StandingsView } from "@/components/game/StandingsView";
import { errorCode } from "@/lib/errors";
import { Loading } from "@/routes/__root";

export function LobbyView({ gameId, embedded = false }: { gameId: Id<"games">; embedded?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const data = useQuery(api.games.get, { gameId });
  // Separate subscription on purpose: heartbeats churn every few seconds, and this keeps
  // that churn off the roster query. See presence.onlineIn.
  const onlineIds = useQuery(api.presence.onlineIn, { gameId });
  const start = useMutation(api.sessions.start);
  const closeSitting = useMutation(api.sessions.close);
  const addBot = useMutation(api.games.addBot);
  const addManual = useMutation(api.games.addManualPlayer);
  const removePlayer = useMutation(api.games.removePlayer);
  const leave = useMutation(api.games.leave);
  const setCheckedIn = useMutation(api.games.setCheckedIn);
  const rematch = useMutation(api.games.rematch);
  const kickToBot = useMutation(api.games.kickToBot);
  const removeGame = useMutation(api.games.remove);
  const linkPlayer = useMutation(api.games.linkPlayer);
  const setScore = useMutation(api.games.setScore);
  const setOrder = useMutation(api.games.setOrder);
  const [linking, setLinking] = useState<string | null>(null);
  const [scoring, setScoring] = useState<{ playerId: string; value: string } | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [manualName, setManualName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (data === undefined) return <Loading />;
  if (data === null) return null;
  const { game, players, me, isOwner, session } = data;
  const online = new Set(onlineIds ?? []);
  // While the organizer is in the room, opening a sitting is their call alone.
  const ownerOnline = online.has(game.ownerId);
  const isOnline = (p: { isBot: boolean; userId: Id<"users"> | undefined }) =>
    p.isBot || (p.userId !== undefined && online.has(p.userId));
  const isCampaign = game.mode === "campaign";
  const sittingActive = session?.status === "active";
  const seatedCount = isCampaign ? players.filter((p) => p.checkedIn).length : players.length;
  const cap = discardCapFor(game.config.deck, seatedCount);
  const canStart = seatedCount >= MIN_SEATS && seatedCount <= game.config.seats && cap !== null;
  const inviteUrl = `${window.location.origin}/join/${game.code}`;
  // In a campaign the roster outlives any one sitting, so roster work carries on while a
  // table is live. Only the seats actually in play are off limits.
  const seatedNow = new Set(sittingActive ? session!.seats : []);
  const rosterOpen = game.status !== "finished" && (isCampaign || !sittingActive);
  const manualPlayers = players.filter((p) => !p.isBot && !p.userId);
  // Accounts that can absorb another row's history: fresh ones, not the one being linked.
  const linkableAccounts = players.filter(
    (p) => !p.isBot && p.userId && p.roundsPlayed === 0 && !seatedNow.has(p._id) && p._id !== linking,
  );
  const canArrange = isOwner && game.status !== "finished";
  const move = (playerId: string, dir: -1 | 1) => {
    const ids = players.map((p) => p._id);
    const i = ids.indexOf(playerId as Id<"gamePlayers">);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    void run(() => setOrder({ gameId, playerIds: ids }));
  };
  const sittingHost = sittingActive ? players.find((p) => p._id === session!.hostPlayerId) ?? null : null;
  // Anyone at the table can call time, plus the opener and the table owner.
  const canCloseSitting =
    sittingActive && me !== null && (isOwner || session!.hostPlayerId === me._id || session!.seats.includes(me._id));
  // A campaign sitting does not wait for the organizer, unless they are in the room.
  const canOpenSitting = isCampaign && !sittingActive && game.status !== "finished" && me !== null && canStart && !ownerOnline;
  // The campaign's one question for everybody: are you playing tonight?
  const askToPlay =
    isCampaign && me !== null && !sittingActive && game.status !== "finished" && !seatedNow.has(me._id);
  const endSitting = async () => {
    if (!window.confirm(t("table.endSessionConfirm"))) return;
    await run(() => closeSitting({ gameId }));
  };
  const leaderScore = players.length > 0 ? Math.min(...players.map((p) => p.score)) : game.config.startingPoints;
  const winner = game.winnerPlayerId ? players.find((p) => p._id === game.winnerPlayerId) : null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(errorCode(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (what: "code" | "link") => {
    try {
      await navigator.clipboard.writeText(what === "code" ? game.code : inviteUrl);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className={embedded ? "grid gap-4" : "grid gap-4 lg:grid-cols-[1fr_20rem]"}>
      <div className="space-y-4">
        {askToPlay && !me.checkedIn && (
          <Panel className="flex flex-wrap items-center justify-between gap-4 border-2 border-gold-400 bg-gold-400/15 shadow-[0_0_40px_rgba(232,184,74,0.25)]">
            <div className="min-w-0 flex-1">
              <p className="font-display text-2xl font-extrabold text-cream-50">{t("lobby.wantToPlayTitle")}</p>
              <p className="mt-1 text-sm text-cream-100/80">{t("lobby.wantToPlayHint")}</p>
            </div>
            <Button
              className="want-to-play px-8 py-4 text-lg"
              disabled={busy}
              onClick={() => void run(() => setCheckedIn({ gameId, checkedIn: true }))}
            >
              ✋ {t("lobby.checkIn")}
            </Button>
          </Panel>
        )}
        {askToPlay && me.checkedIn && (
          <Panel className="flex flex-wrap items-center justify-between gap-3 border-emerald-400/50 bg-emerald-400/10">
            <p className="text-sm font-semibold text-emerald-200">✓ {t("lobby.wantToPlayDone")}</p>
            <Button variant="ghost" className="px-3 py-1.5 text-xs" disabled={busy} onClick={() => void run(() => setCheckedIn({ gameId, checkedIn: false }))}>
              {t("lobby.checkOut")}
            </Button>
          </Panel>
        )}
        {game.status === "finished" && winner && (
          <Panel className="border-gold-400/60 bg-gold-400/10 text-center">
            <p className="font-display text-base italic text-gold-400">{t("lobby.finished")}</p>
            <p className="mt-1 font-display text-2xl font-bold text-cream-50">{t("lobby.winner", { name: winner.name })}</p>
            <div className="mt-3 flex justify-center gap-2">
              {(isOwner || game.rematchGameId) && (
                <Button
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const { gameId: next } = await rematch({ gameId });
                      await navigate({ to: "/g/$gameId", params: { gameId: next } });
                    })
                  }
                >
                  {game.rematchGameId ? t("table.joinRematch") : t("table.playAgain")}
                </Button>
              )}
            </div>
          </Panel>
        )}

        {sittingActive && session && (
          <Panel className="flex flex-wrap items-center justify-between gap-3 border-gold-400/40">
            <div>
              <p className="font-display text-base italic text-gold-400">{t("lobby.inProgress")}</p>
              <p className="text-sm text-cream-100/80">
                {t("lobby.sittingPreview", { count: session.seatCount, cap: session.maxDiscard })}
              </p>
              {sittingHost && <p className="text-xs text-cream-100/60">{t("lobby.sessionHost", { name: sittingHost.name })}</p>}
            </div>
            <div className="flex gap-2">
              {!embedded && (
                <Link to="/g/$gameId/table" params={{ gameId }}>
                  <Button>{t("lobby.goToTable")}</Button>
                </Link>
              )}
              {isCampaign && canCloseSitting && (
                <Button variant="ghost" disabled={busy} onClick={() => void endSitting()}>
                  {t("lobby.endSession")}
                </Button>
              )}
            </div>
          </Panel>
        )}

        {/* Once the game is over nothing on the roster can change, and what everyone wants to
            see is how it ended. */}
        {game.status === "finished" ? (
          <StandingsView gameId={gameId} readOnly />
        ) : (
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-xl font-bold text-cream-50">
              {isCampaign ? t("lobby.roster") : t("lobby.players")}{" "}
              <span className="text-sm font-normal text-cream-100/60">
                {players.length}/{game.config.rosterSize}
              </span>
            </h2>
            {!sittingActive && (
              <p className="text-xs text-cream-100/60">{t("lobby.waiting", { min: MIN_SEATS, max: game.config.seats })}</p>
            )}
          </div>
          <ul className="divide-y divide-white/10">
            {players.map((p, idx) => (
              <li key={p._id} className="flex flex-wrap items-center gap-3 py-2.5">
                {canArrange && (
                  <div className="flex flex-col -space-y-1">
                    <button
                      type="button"
                      className="rounded px-1 text-xs leading-none text-cream-100/50 hover:text-gold-400 disabled:opacity-20"
                      disabled={busy || idx === 0}
                      onClick={() => move(p._id, -1)}
                      aria-label={t("lobby.moveUp")}
                      title={t("lobby.moveUp")}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="rounded px-1 text-xs leading-none text-cream-100/50 hover:text-gold-400 disabled:opacity-20"
                      disabled={busy || idx === players.length - 1}
                      onClick={() => move(p._id, 1)}
                      aria-label={t("lobby.moveDown")}
                      title={t("lobby.moveDown")}
                    >
                      ▼
                    </button>
                  </div>
                )}
                <Avatar seed={p.avatarSeed} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-cream-50">{p.name}</span>
                    {p.isMe && <Tag>{t("common.you")}</Tag>}
                    {p.userId === game.ownerId && <Tag>{t("common.host")}</Tag>}
                    {p.isBot && <Tag>{t("common.bot")}</Tag>}
                    {p.botControlled && <Tag>{t("table.botStandIn")}</Tag>}
                    {isCampaign && !p.isBot && !p.userId && <Tag>{t("lobby.manualTag")}</Tag>}
                    {isCampaign && p.checkedIn && !sittingActive && <Tag gold>{t("lobby.checkedIn")}</Tag>}
                    {isCampaign && sittingActive && !p.isBot && p.userId && isOnline(p) && !seatedNow.has(p._id) && <Tag>{t("lobby.spectating")}</Tag>}
                  </div>
                  <div className="text-xs text-cream-100/60">
                    {p.score} {t("common.points")}, {p.roundsPlayed} {t("common.rounds")}
                    {!p.isBot && p.userId && (
                      <span className={`ml-2 ${isOnline(p) ? "text-emerald-300" : "text-cream-100/40"}`}>
                        ● {isOnline(p) ? t("common.online") : t("common.offline")}
                      </span>
                    )}
                  </div>
                </div>
                {/* Your own hand is yours to raise or lower; the organizer's covers the whole
                    roster, because people put their name down and then go home. */}
                {isCampaign && rosterOpen && !seatedNow.has(p._id) && (p.isMe || isOwner) && (
                  <Button
                    variant={p.checkedIn ? "ghost" : p.isMe ? "primary" : "secondary"}
                    className={`px-3 py-1.5 text-xs ${p.isMe && !p.checkedIn ? "want-to-play" : ""}`}
                    disabled={busy}
                    onClick={() => void run(() => setCheckedIn({ gameId, playerId: p._id, checkedIn: !p.checkedIn }))}
                  >
                    {p.checkedIn ? t("lobby.checkOut") : t("lobby.checkIn")}
                  </Button>
                )}
                {isOwner && !p.isMe && (isCampaign || (!p.isBot && !p.botControlled)) && seatedNow.has(p._id) && game.status !== "finished" && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() => {
                      if (!window.confirm(t(isCampaign ? "table.kickConfirmCampaign" : "table.kickConfirm", { name: p.name }))) return;
                      void run(() => kickToBot({ gameId, playerId: p._id }));
                    }}
                  >
                    {t(isCampaign ? "table.kickCampaign" : "table.kick")}
                  </Button>
                )}
                {isOwner && isCampaign && rosterOpen && !seatedNow.has(p._id) && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() =>
                      setScoring(scoring?.playerId === p._id ? null : { playerId: p._id, value: String(p.score) })
                    }
                  >
                    {t("lobby.setScore")}
                  </Button>
                )}
                {isOwner && isCampaign && !p.isBot && rosterOpen && (!p.userId || p.userId !== game.ownerId) && (
                  <Button
                    variant="ghost"
                    className="px-3 py-1.5 text-xs"
                    disabled={busy}
                    onClick={() => setLinking(linking === p._id ? null : p._id)}
                  >
                    {p.userId ? t("lobby.relink") : t("lobby.linkTo")}
                  </Button>
                )}
                {isOwner && !p.isMe && rosterOpen && !seatedNow.has(p._id) && (
                  <button
                    type="button"
                    className="rounded-md px-2 py-1 text-xs text-cream-100/50 hover:bg-white/10 hover:text-heart"
                    disabled={busy}
                    onClick={() => void run(() => removePlayer({ gameId, playerId: p._id }))}
                    aria-label={t("common.remove")}
                  >
                    ✕
                  </button>
                )}
                {scoring?.playerId === p._id && (
                  <form
                    className="mt-2 w-full border-t border-white/10 pt-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const score = Number(scoring.value);
                      void run(async () => {
                        await setScore({ gameId, playerId: p._id, score });
                        setScoring(null);
                      });
                    }}
                  >
                    <p className="text-xs font-semibold text-cream-100/70">{t("lobby.setScoreTitle", { name: p.name })}</p>
                    <p className="mt-1 text-xs text-cream-100/50">
                      {t("lobby.setScoreHint", { start: game.config.startingPoints, leader: leaderScore })}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="number"
                        min={1}
                        max={game.config.startingPoints}
                        value={scoring.value}
                        onChange={(e) => setScoring({ playerId: p._id, value: e.target.value })}
                        className="w-28 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-cream-50 focus:border-gold-400 focus:outline-none"
                        aria-label={t("lobby.setScoreTitle", { name: p.name })}
                      />
                      <Button type="submit" variant="secondary" className="px-3 py-1.5 text-xs" disabled={busy}>
                        {t("lobby.setScoreSave")}
                      </Button>
                    </div>
                  </form>
                )}
                {linking === p._id && (
                  <div className="mt-2 w-full border-t border-white/10 pt-2">
                    <p className="text-xs font-semibold text-cream-100/70">
                      {p.userId ? t("lobby.relinkAccount", { name: p.name }) : t("lobby.linkManual", { name: p.name })}
                    </p>
                    <p className="mt-1 text-xs text-cream-100/50">{p.userId ? t("lobby.relinkHint") : t("lobby.linkHint")}</p>
                    {linkableAccounts.length === 0 ? (
                      <p className="mt-2 text-xs text-cream-100/60">{t("lobby.linkNone")}</p>
                    ) : (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {linkableAccounts.map((a) => (
                          <Button
                            key={a._id}
                            variant="secondary"
                            className="px-3 py-1.5 text-xs"
                            disabled={busy}
                            onClick={() =>
                              void run(async () => {
                                await linkPlayer({ gameId, manualPlayerId: p._id, accountPlayerId: a._id });
                                setLinking(null);
                              })
                            }
                          >
                            <Avatar seed={a.avatarSeed} size={18} />
                            {a.name}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {isCampaign && rosterOpen && manualPlayers.length > 0 && (
            <p className="mt-3 text-xs text-cream-100/50">{t("lobby.linkHint")}</p>
          )}
          {canArrange && players.length > 1 && <p className="mt-3 text-xs text-cream-100/50">{t("lobby.orderHint")}</p>}
        </Panel>
        )}

        {error && <Panel className="border-heart/50 text-sm text-cream-50">{t(`errors.${error}`, { defaultValue: error })}</Panel>}
      </div>

      <div className="space-y-4">
        <Panel>
          <p className="text-xs font-semibold text-cream-100/60">{t("lobby.inviteCode")}</p>
          <p className="mt-1 font-mono text-3xl font-bold tracking-[0.3em] text-gold-400">{game.code}</p>
          <p className="mt-2 text-xs text-cream-100/60">{t("lobby.shareHint")}</p>
          {isCampaign && game.status !== "finished" && <p className="mt-1 text-xs text-gold-400">{t("lobby.joinAnytime")}</p>}
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void copy("code")}>
              {copied === "code" ? t("common.copied") : t("lobby.copyCode")}
            </Button>
            <Button variant="secondary" className="flex-1" onClick={() => void copy("link")}>
              {copied === "link" ? t("common.copied") : t("lobby.copyLink")}
            </Button>
          </div>
        </Panel>

        {isOwner && rosterOpen && (
          <Panel className="space-y-3">
            <p className="text-xs font-semibold text-cream-100/60">{t("lobby.hostControls")}</p>
            {!sittingActive && cap !== null && seatedCount >= MIN_SEATS && (
              <p className="text-sm text-cream-100/80">{t("lobby.sittingPreview", { count: seatedCount, cap })}</p>
            )}
            {!sittingActive && seatedCount < MIN_SEATS && (
              <p className="text-sm text-cream-100/60">{t("lobby.needMin", { min: MIN_SEATS })}</p>
            )}
            {!sittingActive && seatedCount > game.config.seats && (
              <p className="text-sm text-heart">{t("lobby.tooMany", { max: game.config.seats })}</p>
            )}
            {!sittingActive && (
            <Button
              className="w-full"
              disabled={busy || !canStart}
              onClick={() =>
                void run(async () => {
                  await start({ gameId });
                  await navigate({ to: "/g/$gameId/table", params: { gameId } });
                })
              }
            >
              {isCampaign ? t("lobby.openSitting", { count: seatedCount }) : t("lobby.start")}
            </Button>
            )}
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy || players.length >= game.config.rosterSize}
              onClick={() => void run(() => addBot({ gameId }))}
            >
              {t("lobby.addBot")}
            </Button>
            {isCampaign && (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (manualName.trim().length < 2) return;
                  void run(async () => {
                    await addManual({ gameId, name: manualName });
                    setManualName("");
                  });
                }}
              >
                <input
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder={t("lobby.addManualPlaceholder")}
                  maxLength={24}
                  className="min-w-0 flex-1 rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm text-cream-50 focus:border-gold-400 focus:outline-none"
                  aria-label={t("lobby.addManual")}
                />
                <Button type="submit" variant="ghost" disabled={busy || players.length >= game.config.rosterSize}>
                  +
                </Button>
              </form>
            )}
            {isCampaign && !sittingActive && (
              <Link to="/g/$gameId/sessions/new" params={{ gameId }} className="block">
                <Button variant="secondary" className="w-full">
                  {t("lobby.manualEntry")}
                </Button>
              </Link>
            )}
          </Panel>
        )}
        {!isOwner && !sittingActive && game.status !== "finished" && (
          <Panel className="space-y-2">
            {canOpenSitting ? (
              <>
                <p className="text-sm text-cream-100/80">{t("lobby.sittingPreview", { count: seatedCount, cap: cap ?? 0 })}</p>
                <Button
                  className="w-full"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await start({ gameId });
                      await navigate({ to: "/g/$gameId/table", params: { gameId } });
                    })
                  }
                >
                  {t("lobby.startAnyone")}
                </Button>
              </>
            ) : (
              <p className="text-sm text-cream-100/70">
                {!isCampaign ? t("lobby.onlyHost") : ownerOnline ? t("lobby.onlyHostPresent") : t("lobby.startAnyoneHint", { min: MIN_SEATS })}
              </p>
            )}
          </Panel>
        )}

        {me && game.status !== "finished" && !sittingActive && (
          <div className="space-y-1">
            <Button
              variant="ghost"
              className="w-full"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await leave({ gameId });
                  await navigate({ to: "/" });
                })
              }
            >
              {t("lobby.leave")}
            </Button>
            <p className="text-xs text-cream-100/50">{t("lobby.autoDeleteHint")}</p>
          </div>
        )}

        {isOwner && (
          <Panel className="space-y-2 border-heart/40">
            <p className="text-xs font-semibold text-cream-100/60">{t("lobby.danger")}</p>
            <p className="text-xs text-cream-100/60">{t("lobby.deleteHint")}</p>
            <Button
              variant="danger"
              className="w-full"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(t("lobby.deleteConfirm", { name: game.name }))) return;
                void run(async () => {
                  await removeGame({ gameId });
                  await navigate({ to: "/" });
                });
              }}
            >
              {t("lobby.deleteTable")}
            </Button>
          </Panel>
        )}
      </div>
    </div>
  );
}

function Tag({ children, gold = false }: { children: React.ReactNode; gold?: boolean }) {
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider ${gold ? "bg-gold-400/20 text-gold-400" : "bg-white/10 text-cream-100/70"}`}
    >
      {children}
    </span>
  );
}
