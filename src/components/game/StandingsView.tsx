import { useState } from "react";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { SUIT_SYMBOLS, type Suit } from "@/engine";
import { Avatar } from "@/components/ui/Avatar";
import { Panel } from "@/components/ui/Panel";
import { Loading } from "@/routes/__root";

function Sparkline({ points, max }: { points: number[]; max: number }) {
  if (points.length < 2) return <span className="text-xs text-cream-100/40">—</span>;
  const w = 120;
  const h = 28;
  const step = w / (points.length - 1);
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(h - (p / max) * h).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} className="overflow-visible" aria-hidden>
      <path d={d} fill="none" stroke="#e8b84a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function StandingsView({ gameId }: { gameId: Id<"games"> }) {
  const { t } = useTranslation();
  const data = useQuery(api.history.standings, { gameId });
  const sessions = useQuery(api.history.sessions, { gameId });
  const [chosen, setChosen] = useState<Id<"sessions"> | null>(null);
  if (data === undefined || sessions === undefined) return <Loading />;
  if (data === null) return null;
  const { players, startingPoints, winnerPlayerId } = data;
  const sessionId = chosen ?? sessions[0]?._id ?? null;
  const session = sessions.find((s) => s._id === sessionId) ?? null;

  return (
    <div className="space-y-4">
      <Panel className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-cream-100/50">
            <tr>
              <th className="px-4 py-3">#</th>
              <th className="px-2 py-3">{t("lobby.players")}</th>
              <th className="px-2 py-3 text-right">{t("standings.score")}</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">{t("standings.rounds")}</th>
              <th className="hidden px-2 py-3 text-right sm:table-cell">{t("standings.sessions")}</th>
              <th className="px-2 py-3 text-right">{t("standings.lastSession")}</th>
              <th className="hidden px-4 py-3 md:table-cell">{t("standings.trend")}</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.playerId} className={`border-t border-white/10 ${p.playerId === winnerPlayerId ? "bg-gold-400/10" : ""} ${p.left ? "opacity-50" : ""}`}>
                <td className="px-4 py-2.5 font-mono text-cream-100/60">{i + 1}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <Avatar seed={p.avatarSeed} size={28} />
                    <span className="font-semibold text-cream-50">{p.name}</span>
                    {i === 0 && !winnerPlayerId && <span className="rounded bg-gold-400/20 px-1.5 text-[10px] font-semibold text-gold-400">{t("standings.leader")}</span>}
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right">
                  <span className="font-mono text-lg font-bold text-cream-50">{p.score}</span>
                  <span className="ml-1 text-xs text-cream-100/50">{t("standings.remaining")}</span>
                </td>
                <td className="hidden px-2 py-2.5 text-right text-cream-100/80 sm:table-cell">{p.roundsPlayed}</td>
                <td className="hidden px-2 py-2.5 text-right text-cream-100/80 sm:table-cell">{p.sessionsPlayed}</td>
                <td className={`px-2 py-2.5 text-right font-semibold ${p.lastSessionDelta < 0 ? "text-emerald-300" : p.lastSessionDelta > 0 ? "text-heart" : "text-cream-100/40"}`}>
                  {p.lastSessionDelta > 0 ? `+${p.lastSessionDelta}` : p.lastSessionDelta === 0 ? "·" : p.lastSessionDelta}
                </td>
                <td className="hidden px-4 py-2.5 md:table-cell">
                  <Sparkline points={p.trajectory} max={startingPoints} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {players.every((p) => p.roundsPlayed === 0) && <p className="px-4 py-4 text-sm text-cream-100/60">{t("standings.empty")}</p>}
      </Panel>

      {session && (
        <Panel className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <h2 className="font-display text-lg font-bold text-cream-50">{t("standings.roundsTitle")}</h2>
            {sessions.length > 1 && (
              <div className="flex flex-wrap gap-1">
                {sessions.map((s) => (
                  <button
                    key={s._id}
                    type="button"
                    onClick={() => setChosen(s._id)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${s._id === session._id ? "bg-cream-100 text-ink-900" : "text-cream-100/70 hover:bg-white/10"}`}
                  >
                    {t("standings.sessionTab", { n: s.index + 1 })}
                  </button>
                ))}
              </div>
            )}
          </div>
          <RoundMatrix sessionId={session._id} players={session.players} />
        </Panel>
      )}
    </div>
  );
}

function RoundMatrix({ sessionId, players }: { sessionId: Id<"sessions">; players: { playerId: string; name: string; avatarSeed: string }[] }) {
  const { t } = useTranslation();
  const rounds = useQuery(api.history.rounds, { sessionId });
  if (rounds === undefined) return <Loading />;
  const scored = rounds.filter((r) => r.phase === "scored");
  if (scored.length === 0) return <p className="border-t border-white/10 px-4 py-4 text-sm text-cream-100/60">{t("standings.noRounds")}</p>;
  const last = scored[scored.length - 1]!;
  return (
    <div className="overflow-x-auto border-t border-white/10">
      <table className="w-full text-sm">
        <thead className="text-xs text-cream-100/50">
          <tr>
            <th className="px-4 py-2 text-left">#</th>
            {players.map((p) => (
              <th key={p.playerId} className="px-2 py-2 text-right">
                <span className="inline-flex items-center gap-1.5">
                  <Avatar seed={p.avatarSeed} size={20} />
                  {p.name}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {scored.map((r) => (
            <tr key={r._id} className="border-t border-white/5">
              <td className="whitespace-nowrap px-4 py-1.5 text-left font-mono text-cream-100/70">
                {r.index + 1}
                {r.trump && <span className={`ml-1 ${r.trump === "H" || r.trump === "D" ? "text-heart" : "text-cream-50"}`}>{SUIT_SYMBOLS[r.trump as Suit]}</span>}
              </td>
              {r.participants.map((p) => (
                <td
                  key={p.seat}
                  className={`px-2 py-1.5 text-right font-semibold ${p.decision === "out" ? "text-cream-100/35" : (p.delta ?? 0) < 0 ? "text-emerald-300" : (p.delta ?? 0) > 0 ? "text-heart" : "text-cream-100/50"}`}
                  title={p.decision === "out" ? t("table.out") : `${p.tricksWon} ${t("table.tricks")}`}
                >
                  {p.decision === "out" ? "–" : p.delta === null ? "" : p.delta > 0 ? `+${p.delta}` : p.delta}
                </td>
              ))}
            </tr>
          ))}
          <tr className="border-t-2 border-gold-400/40 bg-black/30">
            <td className="px-4 py-2 text-left text-xs text-cream-100/60">{t("standings.total")}</td>
            {last.participants.map((p) => (
              <td key={p.seat} className="px-2 py-2 text-right font-mono text-base font-bold text-cream-50">
                {p.scoreAfter ?? ""}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
