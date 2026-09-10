import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SUIT_SYMBOLS, type Suit } from "@/engine";
import { Avatar } from "@/components/ui/Avatar";
import { Panel } from "@/components/ui/Panel";
import { Loading } from "@/routes/__root";

export function HistoryView({ gameId }: { gameId: Id<"games"> }) {
  const { t, i18n } = useTranslation();
  const sessions = useQuery(api.history.sessions, { gameId });
  const [open, setOpen] = useState<Id<"sessions"> | null>(null);
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
        </Panel>
      ))}
    </div>
  );
}

function SessionRounds({ sessionId, players }: { sessionId: Id<"sessions">; players: { playerId: string; name: string }[] }) {
  const { t } = useTranslation();
  const rounds = useQuery(api.history.rounds, { sessionId });
  const [openRound, setOpenRound] = useState<Id<"rounds"> | null>(null);
  if (rounds === undefined) return <Loading />;
  if (rounds.length === 0) return <p className="px-4 pb-4 text-sm text-cream-100/60">{t("history.noRounds")}</p>;
  const nameOf = (seat: number) => players[seat]?.name ?? t("history.seat", { n: seat + 1 });
  return (
    <div className="overflow-x-auto border-t border-white/10">
      <table className="w-full text-sm">
        <thead className="text-left text-xs text-cream-100/50">
          <tr>
            <th className="px-4 py-2">#</th>
            <th className="px-2 py-2">{t("history.trumpBy")}</th>
            {players.map((p) => (
              <th key={p.playerId} className="px-2 py-2 text-right">
                {p.name}
              </th>
            ))}
            <th className="px-2 py-2" />
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => (
            <>
              <tr key={r._id} className="border-t border-white/5">
                <td className="px-4 py-1.5 font-mono text-cream-100/60">{r.index + 1}</td>
                <td className="px-2 py-1.5">
                  {r.trump ? (
                    <span className={r.trump === "H" || r.trump === "D" ? "text-heart" : "text-cream-50"}>{SUIT_SYMBOLS[r.trump as Suit]}</span>
                  ) : (
                    <span className="text-cream-100/40">—</span>
                  )}
                  {r.phase !== "scored" && <span className="ml-1 text-[10px] text-cream-100/50">…</span>}
                </td>
                {r.participants.map((p) => (
                  <td key={p.seat} className="px-2 py-1.5 text-right">
                    {p.decision === "out" ? (
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
                ))}
                <td className="px-2 py-1.5 text-right">
                  <button type="button" className="text-xs text-cream-100/50 hover:text-gold-400" onClick={() => setOpenRound(openRound === r._id ? null : r._id)}>
                    {t("history.log")}
                  </button>
                </td>
              </tr>
              {openRound === r._id && (
                <tr key={`${r._id}-log`}>
                  <td colSpan={players.length + 3} className="bg-black/20 px-4 py-2">
                    <ActionLog roundId={r._id} nameOf={nameOf} />
                  </td>
                </tr>
              )}
            </>
          ))}
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
