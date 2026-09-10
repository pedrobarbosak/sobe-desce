import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import {
  MAX_ROSTER,
  type GameConfig,
  type PresetId,
  configFromPreset,
  defaultThreshold,
  maxSeatsFor,
  validateConfig,
} from "@/engine";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorCode } from "@/lib/errors";
import { randomTableName } from "@/shared/names";

const PRESET_IDS: PresetId[] = ["normal", "long", "mesaGrande", "party", "liga", "custom"];

export const Route = createFileRoute("/new")({
  validateSearch: (search: Record<string, unknown>): { preset?: PresetId } => {
    const p = search.preset;
    return PRESET_IDS.includes(p as PresetId) ? { preset: p as PresetId } : {};
  },
  component: NewGame,
});

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-cream-100/60">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-cream-100/50">{hint}</p>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-cream-50 focus:border-gold-400 focus:outline-none";

function NewGame() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preset: initialPreset } = Route.useSearch();
  const create = useMutation(api.games.create);
  const [name, setName] = useState(() => randomTableName());
  const [preset, setPreset] = useState<PresetId>(initialPreset ?? "normal");
  const [cfg, setCfg] = useState<GameConfig>(() => {
    const c = configFromPreset(initialPreset ?? "normal");
    const seats = maxSeatsFor(c.deck);
    return { ...c, seats, rosterSize: c.mode === "session" ? seats : Math.max(seats, c.rosterSize) };
  });
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = useMemo(() => validateConfig(cfg), [cfg]);

  const withMaxSeats = (c: GameConfig): GameConfig => {
    const seats = maxSeatsFor(c.deck);
    return { ...c, seats, rosterSize: c.mode === "session" ? seats : Math.max(seats, c.rosterSize) };
  };
  const choosePreset = (id: PresetId) => {
    setPreset(id);
    setCfg(withMaxSeats(configFromPreset(id)));
  };

  const patch = (p: Partial<GameConfig>) => {
    setPreset("custom");
    setCfg((prev) => {
      const next = { ...prev, ...p, preset: "custom" as const };
      if (p.startingPoints !== undefined && prev.forcedPlayThreshold === defaultThreshold(prev.startingPoints)) {
        next.forcedPlayThreshold = defaultThreshold(p.startingPoints);
      }
      next.seats = maxSeatsFor(next.deck);
      if (next.mode === "session") next.rosterSize = next.seats;
      else if (next.rosterSize < next.seats) next.rosterSize = next.seats;
      return next;
    });
  };

  const submit = async () => {
    setBusy(true);
    setServerError(null);
    try {
      const { gameId } = await create({ name: name || undefined, config: cfg });
      await navigate({ to: "/g/$gameId", params: { gameId } });
    } catch (err) {
      setServerError(errorCode(err));
      setBusy(false);
    }
  };

  const num = (v: string) => (v === "" ? 0 : Number(v));

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-4xl font-extrabold text-cream-50">{t("new.title")}</h1>

      <Panel>
        <span className="text-xs font-semibold text-cream-100/60">{t("new.preset")}</span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PRESET_IDS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => choosePreset(id)}
              className={`rounded-xl border px-3 py-2 text-left transition ${preset === id ? "border-gold-400 bg-gold-400/10" : "border-white/15 hover:bg-white/5"}`}
            >
              <div className="font-semibold text-cream-50">{t(`presets.${id}.name`)}</div>
              <div className="text-xs text-cream-100/60">{t(`presets.${id}.desc`)}</div>
            </button>
          ))}
        </div>
      </Panel>

      <Panel className="grid gap-4 sm:grid-cols-2">
        <Field label={t("new.name")}>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("new.namePlaceholder")} maxLength={40} className={inputCls} />
            <button type="button" onClick={() => setName(randomTableName())} className="shrink-0 rounded-lg border border-white/20 px-3 text-lg hover:bg-white/10" title={t("new.randomName")} aria-label={t("new.randomName")}>
              🎲
            </button>
          </div>
        </Field>
        <Field label={t("new.mode")} hint={cfg.mode === "session" ? t("new.modeSessionHint") : t("new.modeCampaignHint")}>
          <div className="flex overflow-hidden rounded-lg border border-white/20">
            {(["session", "campaign"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => patch({ mode: m, rosterSize: m === "session" ? cfg.seats : Math.max(cfg.seats, cfg.rosterSize) })}
                className={`flex-1 px-3 py-2 text-sm font-semibold ${cfg.mode === m ? "bg-cream-100 text-ink-900" : "text-cream-100/80 hover:bg-white/10"}`}
              >
                {t(`modes.${m}`)}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t("new.deck")}>
          <div className="flex overflow-hidden rounded-lg border border-white/20">
            {([40, 52] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => patch({ deck: d })}
                className={`flex-1 px-3 py-2 text-sm font-semibold ${cfg.deck === d ? "bg-cream-100 text-ink-900" : "text-cream-100/80 hover:bg-white/10"}`}
              >
                {d} {t("new.cards")}
              </button>
            ))}
          </div>
        </Field>
        {cfg.mode === "campaign" && (
          <Field label={t("new.roster")}>
            <input type="number" min={cfg.seats} max={MAX_ROSTER} value={cfg.rosterSize} onChange={(e) => patch({ rosterSize: num(e.target.value) })} className={inputCls} />
          </Field>
        )}
        <Field label={t("new.startingPoints")}>
          <input type="number" min={1} value={cfg.startingPoints} onChange={(e) => patch({ startingPoints: num(e.target.value) })} className={inputCls} />
        </Field>
        <Field label={t("new.threshold")} hint={t("new.thresholdHint")}>
          <input type="number" min={0} max={cfg.startingPoints} value={cfg.forcedPlayThreshold} onChange={(e) => patch({ forcedPlayThreshold: num(e.target.value) })} className={inputCls} />
        </Field>
        <Field label={t("new.blankPenalty")}>
          <input type="number" min={0} value={cfg.blankPenalty} onChange={(e) => patch({ blankPenalty: num(e.target.value) })} className={inputCls} />
        </Field>
        <Field label={t("new.turnSeconds")}>
          <input type="number" min={10} max={180} value={cfg.turnSeconds} onChange={(e) => patch({ turnSeconds: num(e.target.value) })} className={inputCls} />
        </Field>
      </Panel>

      {(errors.length > 0 || serverError) && (
        <Panel className="border-heart/50 text-sm text-cream-50">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{t(`new.errors.${e}`)}</li>
            ))}
            {serverError && <li>{t(`errors.${serverError}`, { defaultValue: serverError })}</li>}
          </ul>
        </Panel>
      )}

      <div className="flex justify-end">
        <Button onClick={() => void submit()} disabled={busy || errors.length > 0} className="px-7 py-3 text-base">
          {t("new.create")}
        </Button>
      </div>
    </div>
  );
}
