import { Fragment, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { LuUndo2 } from "react-icons/lu";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SUIT_SYMBOLS, type Suit } from "@/engine";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorCode } from "@/lib/errors";
import { Loading } from "@/routes/__root";

export function HistoryView({ gameId }: { gameId: Id<"games"> }) {
  const { t, i18n } = useTranslation();
  const sessions = useQuery(api.history.sessions, { gameId });
  const view = useQuery(api.games.get, { gameId });
  const removeSession = useMutation(api.sessions.remove);
  const [open, setOpen] = useState<Id<"sessions"> | null>(null);
  const [deleting, setDeleting] = useState<Id<"sessions"> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isOwner = view?.isOwner ?? false;
  const erase = (sessionId: Id<"sessions">, revertScores: boolean) => {
    setError(null);
    removeSession({ gameId, sessionId, revertScores })
      .then(() => setDeleting(null))
      .catch((err) => setError(errorCode(err)));
  };
  if (sessions === undefined) return <Loading />;
  if (sessions.length === 0) return <Panel className="text-sm text-cream-100/60">{t("history.empty")}</Panel>;
  return (
    <div className="space-y-3">
      {sessions.map((s) => (
        <Panel key={s._id} className="p-0">
          <button type="button" className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setOpen(open === s._id ? null : s._id)}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-lg font-bold text-cream-50">{t("history.session", { n: s.index + 1 })}</span>
                <span className="rounded bg-white/10 px-1.5 text-[10px] font-semibold text-cream-100/70">{s.manual ? t("history.manual") : t("history.live")}</span>
                {s.status === "active" && <span className="rounded bg-gold-400/20 px-1.5 text-[10px] font-semibold text-gold-400">{t("lobby.inProgress")}</span>}
              </div>
              <div className="text-xs text-cream-100/60">
                {new Date(s.startedAt).toLocaleDateString(i18n.language)}, {t("history.rounds", { count: s.roundsPlayed })}, {t("table.cap", { cap: s.maxDiscard })}
                {s.note && <span className="ml-2 italic">“{s.note}”</span>}
              </div>
            </div>
            <div className="flex -space-x-2">
              {s.players.map((p) => (
                <Avatar key={p.playerId} seed={p.avatarSeed} size={26} />
              ))}
            </div>
          </button>
          {open === s._id && <SessionRounds sessionId={s._id} players={s.players} />}
          {isOwner && s.status !== "active" && (
            <div className="border-t border-white/10 px-4 py-2">
              {deleting === s._id ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-cream-50">{t("history.deleteTitle", { n: s.index + 1 })}</p>
                  <p className="text-xs text-cream-100/60">{t("history.deleteHint")}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="danger" className="px-3 py-1.5 text-xs" onClick={() => erase(s._id, true)}>
                      {t("history.deleteRevert")}
                    </Button>
                    <Button variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => erase(s._id, false)}>
                      {t("history.deleteKeep")}
                    </Button>
                    <Button variant="ghost" className="px-3 py-1.5 text-xs" onClick={() => setDeleting(null)}>
                      {t("common.cancel")}
                    </Button>
                  </div>
                  {error && <p className="text-xs text-heart">{t(`errors.${error}`, { defaultValue: error })}</p>}
                </div>
              ) : (
                <button type="button" className="text-xs text-cream-100/40 hover:text-heart" onClick={() => setDeleting(s._id)}>
                  {t("history.delete")}
                </button>
              )}
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}

/**
 * One sitting, round by round. Columns are the sitting's whole line-up and each cell is
 * looked up by player, never by seat index: seats are renumbered the moment somebody
 * leaves, so a round played before that has its seats in different places from the round
 * after it, and reading them positionally put everybody's points under the wrong name.
 */
function SessionRounds({
  sessionId,
  players,
}: {
  sessionId: Id<"sessions">;
  players: { playerId: string; name: string; left: boolean }[];
}) {
  const { t } = useTranslation();
  const rounds = useQuery(api.history.rounds, { sessionId });
  const [openRound, setOpenRound] = useState<Id<"rounds"> | null>(null);
  if (rounds === undefined) return <Loading />;
  if (rounds.length === 0) return <p className="px-4 pb-4 text-sm text-cream-100/60">{t("history.noRounds")}</p>;
  const nameById = new Map(players.map((p) => [p.playerId, p.name]));
  return (
    <div className="overflow-x-auto border-t border-white/10">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-cream-100/50">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-2 py-2">{t("history.trumpBy")}</th>
            {players.map((p) => (
              <th key={p.playerId} className={`px-2 py-2 text-right ${p.left ? "opacity-50" : ""}`} title={p.left ? t("history.leftSitting") : undefined}>
                {p.name}
                {p.left && <LuUndo2 className="icon ml-1" />}
              </th>
            ))}
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const byPlayer = new Map(r.participants.map((p) => [p.gamePlayerId as string, p]));
            const seatNames = new Map(r.participants.map((p) => [p.seat, nameById.get(p.gamePlayerId) ?? null]));
            const nameOf = (seat: number) => seatNames.get(seat) ?? t("history.seat", { n: seat + 1 });
            return (
            <Fragment key={r._id}>
              <tr className="border-t border-white/5">
                <td className="px-4 py-1.5 font-mono text-cream-100/60">{r.index + 1}</td>
                <td className="px-2 py-1.5">
                  {r.trump ? (
                    <span className={r.trump === "H" || r.trump === "D" ? "text-heart" : "text-cream-50"}>{SUIT_SYMBOLS[r.trump as Suit]}</span>
                  ) : (
                    <span className="text-cream-100/40">—</span>
                  )}
                  {r.phase !== "scored" && <span className="ml-1 text-[10px] text-cream-100/50">…</span>}
                </td>
                {players.map((col) => {
                  const p = byPlayer.get(col.playerId);
                  return (
                  <td key={col.playerId} className="px-2 py-1.5 text-right">
                    {p === undefined ? (
                      <span className="text-cream-100/25">·</span>
                    ) : p.decision === "out" ? (
                      <span className="text-cream-100/40">{t("table.out")}</span>
                    ) : (
                      <>
                        <span className={`font-semibold ${(p.delta ?? 0) < 0 ? "text-emerald-300" : (p.delta ?? 0) > 0 ? "text-heart" : "text-cream-100/50"}`}>
                          {p.delta === null ? "" : p.delta > 0 ? `+${p.delta}` : p.delta}
                        </span>
                        <span className="ml-1 font-mono text-cream-100/70">{p.scoreAfter ?? ""}</span>
                      </>
                    )}
                  </td>
                  );
                })}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" className="text-xs text-cream-100/50 hover:text-gold-400" onClick={() => setOpenRound(openRound === r._id ? null : r._id)}>
                    {t("history.log")}
                  </button>
                </td>
              </tr>
              {openRound === r._id && (
                <tr>
                  <td colSpan={players.length + 3} className="bg-black/20 px-4 py-2">
                    <ActionLog roundId={r._id} nameOf={nameOf} />
                  </td>
                </tr>
              )}
            </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ActionLog({ roundId, nameOf }: { roundId: Id<"rounds">; nameOf: (seat: number) => string }) {
  const { t } = useTranslation();
  const actions = useQuery(api.history.actions, { roundId });
  if (actions === undefined) return <Loading />;
  if (actions.length === 0) return <p className="text-xs text-cream-100/50">—</p>;
  return (
    <ol className="space-y-0.5 font-mono text-xs text-cream-100/80">
      {actions.map((a) => {
        const payload = a.payload as { suit?: Suit; count?: number; card?: string };
        const what =
          a.type === "nameTrump"
            ? `${t("table.trump")} ${payload.suit ? SUIT_SYMBOLS[payload.suit] : ""}`
            : a.type === "flipTrump"
              ? t("table.logFlip")
              : a.type === "darkHearts"
                ? t("table.logDark")
              : a.type === "discard"
              ? `${t("table.discardN", { count: payload.count ?? 0 })}`
              : a.type === "sitOut"
                ? t("table.sitOut")
                : payload.card ?? a.type;
        return (
          <li key={a.seq}>
            <span className="text-cream-100/40">{String(a.seq + 1).padStart(2, "0")}</span> {nameOf(a.seat)}: {what}
            {a.actor !== "user" && <span className="ml-1 text-cream-100/40">({t(`history.actor.${a.actor}`)})</span>}
          </li>
        );
      })}
    </ol>
  );
}
