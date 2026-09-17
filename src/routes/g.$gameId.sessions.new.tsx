import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { LuX } from "react-icons/lu";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { SUITS, SUIT_SYMBOLS, type Suit, TRICKS_PER_ROUND, applyDeltas, roundDeltas } from "@/engine";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorCode } from "@/lib/errors";
import { Loading } from "./__root";

export const Route = createFileRoute("/g/$gameId/sessions/new")({ component: ManualSession });

type RoundDraft = { trump: Suit; out: Set<string>; tricks: Record<string, number> };

function ManualSession() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { gameId: raw } = Route.useParams();
  const gameId = raw as Id<"games">;
  const data = useQuery(api.games.get, { gameId });
  const record = useMutation(api.sessions.recordManual);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"rounds" | "deltas">("rounds");
  const [rounds, setRounds] = useState<RoundDraft[]>([{ trump: "S", out: new Set(), tricks: {} }]);
  const [deltas, setDeltas] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = data?.players ?? [];
  const seated = players.filter((p) => chosen.has(p._id));

  const preview = useMemo(() => {
    if (!data) return null;
    const ids = seated.map((p) => p._id);
    const seatOf = new Map(ids.map((id, i) => [id, i]));
    let scores = new Map(seated.map((p, i) => [i, p.score]));
    let winner: number | undefined;
    if (mode === "rounds") {
      for (const r of rounds) {
        if (winner !== undefined) break;
        const d = roundDeltas(
          seated.map((p, i) => ({ seat: i, participated: !r.out.has(p._id), tricksWon: r.tricks[p._id] ?? 0 })),
          r.trump,
          data.game.config.blankPenalty,
        );
        const res = applyDeltas(scores, d, ids.map((_, i) => i));
        scores = res.scores;
        winner = res.winner;
      }
    } else {
      const d = new Map(ids.map((id) => [seatOf.get(id)!, Math.trunc(deltas[id] ?? 0)]));
      const res = applyDeltas(scores, d, ids.map((_, i) => i));
      scores = res.scores;
      winner = res.winner;
    }
    return { scores, winner };
  }, [data, seated, mode, rounds, deltas]);

  if (data === undefined) return <Loading />;
  if (data === null) return null;
  if (!data.isOwner || data.game.mode !== "campaign") {
    return <Panel className="text-sm text-cream-100/70">{t("errors.notOwner")}</Panel>;
  }

  const roundSums = rounds.map((r) => seated.filter((p) => !r.out.has(p._id)).reduce((n, p) => n + (r.tricks[p._id] ?? 0), 0));
  const roundsValid = rounds.every((r, i) => seated.filter((p) => !r.out.has(p._id)).length === 0 || roundSums[i] === TRICKS_PER_ROUND);
  const canSave = seated.length >= 2 && (mode === "deltas" || roundsValid);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const playedAt = new Date(`${date}T12:00:00`).getTime();
      await record({
        gameId,
        playerIds: seated.map((p) => p._id),
        note: note || undefined,
        playedAt: Number.isFinite(playedAt) ? playedAt : undefined,
        ...(mode === "rounds"
          ? {
              rounds: rounds.map((r) => ({
                trump: r.trump,
                results: seated.map((p) => ({ playerId: p._id, participated: !r.out.has(p._id), tricksWon: r.out.has(p._id) ? 0 : r.tricks[p._id] ?? 0 })),
              })),
            }
          : { deltas: seated.map((p) => ({ playerId: p._id, delta: Math.trunc(deltas[p._id] ?? 0) })) }),
      });
      await navigate({ to: "/g/$gameId/standings", params: { gameId } });
    } catch (err) {
      setError(errorCode(err));
      setBusy(false);
    }
  };

  const updateRound = (i: number, fn: (r: RoundDraft) => RoundDraft) =>
    setRounds((prev) => prev.map((r, j) => (j === i ? fn({ ...r, out: new Set(r.out), tricks: { ...r.tricks } }) : r)));

  const numCls = "w-16 rounded-md border border-white/20 bg-black/30 px-2 py-1 text-center text-cream-50 focus:border-gold-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-3xl space-y-4 short:space-y-3">
      <div>
        <h2 className="font-display text-2xl font-bold text-cream-50 short:text-lg">{t("manual.title")}</h2>
        <p className="text-sm text-cream-100/70">{t("manual.intro")}</p>
      </div>

      <Panel>
        <p className="text-xs font-semibold text-cream-100/60">{t("manual.who")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {players.map((p) => (
            <button
              key={p._id}
              type="button"
              onClick={() =>
                setChosen((prev) => {
                  const next = new Set(prev);
                  if (next.has(p._id)) next.delete(p._id);
                  else next.add(p._id);
                  return next;
                })
              }
              className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-sm transition ${chosen.has(p._id) ? "border-gold-400 bg-gold-400/15 text-cream-50" : "border-white/15 text-cream-100/70 hover:bg-white/5"}`}
            >
              <Avatar seed={p.avatarSeed} size={24} />
              {p.name}
              <span className="font-mono text-xs text-cream-100/50">{p.score}</span>
            </button>
          ))}
        </div>
        {seated.length < 2 && <p className="mt-2 text-xs text-cream-100/50">{t("manual.needTwo")}</p>}
      </Panel>

      <Panel className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-cream-100/60">{t("manual.mode")}</p>
          <div className="flex overflow-hidden rounded-lg border border-white/20 text-sm">
            {(["rounds", "deltas"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`px-3 py-1.5 font-semibold ${mode === m ? "bg-cream-100 text-ink-900" : "text-cream-100/80 hover:bg-white/10"}`}>
                {m === "rounds" ? t("manual.byRounds") : t("manual.byDeltas")}
              </button>
            ))}
          </div>
        </div>

        {mode === "rounds" ? (
          <div className="space-y-3">
            {rounds.map((r, i) => (
              <div key={i} className="rounded-xl border border-white/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-cream-50">{t("manual.round", { n: i + 1 })}</span>
                  <div className="flex items-center gap-1">
                    <span className="mr-1 text-xs text-cream-100/60">{t("manual.trump")}</span>
                    {SUITS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => updateRound(i, (x) => ({ ...x, trump: s }))}
                        className={`h-8 w-8 rounded-md text-lg ${r.trump === s ? "bg-cream-50" : "bg-black/30 hover:bg-white/10"} ${s === "H" || s === "D" ? "text-heart" : r.trump === s ? "text-ink-900" : "text-cream-50"}`}
                        aria-label={t(`suits.${s}`)}
                      >
                        {SUIT_SYMBOLS[s]}
                      </button>
                    ))}
                    {rounds.length > 1 && (
                      <button type="button" className="ml-2 text-xs text-cream-100/50 hover:text-heart" onClick={() => setRounds((prev) => prev.filter((_, j) => j !== i))}>
                        <LuX className="icon" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 short:grid-cols-4">
                  {seated.map((p) => (
                    <div key={p._id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="truncate text-cream-50">{p.name}</span>
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-xs text-cream-100/60">
                          <input
                            type="checkbox"
                            checked={r.out.has(p._id)}
                            disabled={r.trump === "C"}
                            onChange={(e) =>
                              updateRound(i, (x) => {
                                if (e.target.checked) x.out.add(p._id);
                                else x.out.delete(p._id);
                                return x;
                              })
                            }
                          />
                          {t("manual.satOut")}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={5}
                          disabled={r.out.has(p._id)}
                          value={r.out.has(p._id) ? "" : r.tricks[p._id] ?? 0}
                          onChange={(e) => updateRound(i, (x) => ({ ...x, tricks: { ...x.tricks, [p._id]: Number(e.target.value) } }))}
                          className={numCls}
                          aria-label={t("manual.tricks")}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {seated.some((p) => !r.out.has(p._id)) && roundSums[i] !== TRICKS_PER_ROUND && (
                  <p className="mt-2 text-xs text-heart">{t("manual.sumWarning", { sum: roundSums[i] })}</p>
                )}
              </div>
            ))}
            <Button variant="ghost" onClick={() => setRounds((prev) => [...prev, { trump: "S", out: new Set(), tricks: {} }])}>
              + {t("manual.addRound")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {seated.map((p) => (
              <div key={p._id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-cream-50">{p.name}</span>
                <input type="number" value={deltas[p._id] ?? 0} onChange={(e) => setDeltas((d) => ({ ...d, [p._id]: Number(e.target.value) }))} className={numCls} aria-label={t("manual.delta")} />
              </div>
            ))}
          </div>
        )}
      </Panel>

      {preview && seated.length >= 2 && (
        <Panel>
          <p className="text-xs font-semibold text-cream-100/60">{t("manual.preview")}</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {seated.map((p, i) => (
              <li key={p._id} className="flex justify-between text-sm">
                <span className="text-cream-50">{p.name}</span>
                <span className="font-mono">
                  <span className="text-cream-100/50">{p.score} → </span>
                  <span className={preview.winner === i ? "font-bold text-gold-400" : "text-cream-50"}>{preview.scores.get(i)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-cream-100/60">
          {t("manual.date")}
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 block w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm normal-case tracking-normal text-cream-50" />
        </label>
        <label className="block text-xs font-semibold text-cream-100/60">
          {t("manual.note")}
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("manual.notePlaceholder")} maxLength={200} className="mt-1 block w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-sm normal-case tracking-normal text-cream-50" />
        </label>
      </Panel>

      {error && <Panel className="border-heart/50 text-sm text-cream-50">{t(`errors.${error}`, { defaultValue: error })}</Panel>}
      <div className="flex justify-end">
        <Button disabled={busy || !canSave} onClick={() => void submit()}>
          {t("manual.save")}
        </Button>
      </div>
    </div>
  );
}
