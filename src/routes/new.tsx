import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { useTranslation } from "react-i18next";
import { LuChevronRight, LuDices } from "react-icons/lu";
import { api } from "../../convex/_generated/api";
import {
  MAX_ROSTER,
  MAX_POWERUPS,
  OFFERED_PRESETS,
  type ConfigError,
  type GameConfig,
  type PresetId,
  type Variant,
  configFromPreset,
  defaultThreshold,
  maxSeatsFor,
  validateConfig,
} from "@/engine";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorCode } from "@/lib/errors";
import { randomTableName } from "@/shared/names";

const PRESET_IDS: readonly PresetId[] = [...OFFERED_PRESETS, "custom"];

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

/** A two-or-three-way switch: one button per option, the chosen one lit. */
function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: readonly T[]; onChange: (v: T) => void; label: (v: T) => React.ReactNode }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-white/20">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          aria-pressed={o === value}
          className={`flex-1 px-3 py-2 text-sm font-semibold ${o === value ? "bg-cream-100 text-ink-900" : "text-cream-100/80 hover:bg-white/10"}`}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border bg-black/30 px-3 py-2 text-cream-50 focus:border-gold-400 focus:outline-none";

/** The table size is derived from the deck, and the roster follows it in session mode. */
function withMaxSeats(c: GameConfig): GameConfig {
  const seats = maxSeatsFor(c.deck);
  return { ...c, seats, rosterSize: c.mode === "session" ? seats : Math.max(seats, c.rosterSize) };
}

/**
 * Three presets cover nearly every table. The name is the one thing everyone types; all
 * the knobs the preset already chose sit behind one "advanced" fold, and touching any of
 * them turns the table into a custom one.
 */
function NewGame() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { preset: initialPreset } = Route.useSearch();
  const create = useMutation(api.games.create);
  const [name, setName] = useState(() => randomTableName());
  const [preset, setPreset] = useState<PresetId>(initialPreset ?? "classic");
  const [cfg, setCfg] = useState<GameConfig>(() => withMaxSeats(configFromPreset(initialPreset ?? "classic")));
  const [advanced, setAdvanced] = useState(initialPreset === "custom");
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const errors = useMemo(() => validateConfig(cfg), [cfg]);
  const invalid = (e: ConfigError) => (errors.includes(e) ? "border-heart" : "border-white/20");
  // A problem inside the fold is shown, not hidden behind it.
  const showAdvanced = advanced || errors.length > 0;

  const choosePreset = (id: PresetId) => {
    setPreset(id);
    setCfg(withMaxSeats(configFromPreset(id)));
  };

  const patch = (p: Partial<GameConfig>) => {
    setPreset("custom");
    setCfg((prev) => {
      const next = { ...prev, ...p, preset: "custom" as const };
      // The threshold tracks a quarter of the starting points until it is set by hand.
      if (p.startingPoints !== undefined && prev.forcedPlayThreshold === defaultThreshold(prev.startingPoints)) {
        next.forcedPlayThreshold = defaultThreshold(p.startingPoints);
      }
      return withMaxSeats(next);
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

  // Everything the table will be, in one line, whatever the fold hides.
  const summary = [
    t(`variants.${cfg.variant}`),
    t(`modes.${cfg.mode}`),
    `${cfg.deck} ${t("new.cards")}`,
    t("new.summaryPlayers", { max: cfg.seats }),
    cfg.mode === "campaign" ? t("new.summaryRoster", { count: cfg.rosterSize }) : null,
    t("new.summaryPoints", { points: cfg.startingPoints }),
    t("new.summaryTurn", { seconds: cfg.turnSeconds }),
  ]
    .filter((s): s is string => s !== null)
    .join(" · ");

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="font-display text-4xl font-extrabold text-cream-50">{t("new.title")}</h1>

      <Panel>
        <span className="text-xs font-semibold text-cream-100/60">{t("new.preset")}</span>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {OFFERED_PRESETS.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => choosePreset(id)}
              aria-pressed={preset === id}
              className={`rounded-xl border px-3 py-2 text-left transition ${preset === id ? "border-gold-400 bg-gold-400/10" : "border-white/15 hover:bg-white/5"}`}
            >
              <div className="font-semibold text-cream-50">{t(`presets.${id}.name`)}</div>
              <div className="text-xs text-cream-100/60">{t(`presets.${id}.desc`)}</div>
            </button>
          ))}
          {preset === "custom" && (
            <div className="rounded-xl border border-gold-400 bg-gold-400/10 px-3 py-2 text-left" aria-current="true">
              <div className="font-semibold text-cream-50">{t("presets.custom.name")}</div>
              <div className="text-xs text-cream-100/60">{t("new.customNote")}</div>
            </div>
          )}
        </div>
      </Panel>

      <Panel className="space-y-4">
        <Field label={t("new.name")}>
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("new.namePlaceholder")} maxLength={40} className={`${inputCls} border-white/20`} />
            <button type="button" onClick={() => setName(randomTableName())} className="shrink-0 rounded-lg border border-white/20 px-3 text-lg hover:bg-white/10" title={t("new.randomName")} aria-label={t("new.randomName")}>
              <LuDices className="icon" />
            </button>
          </div>
        </Field>

        <div className="border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setAdvanced((o) => !o)}
            aria-expanded={showAdvanced}
            className="flex w-full items-center justify-between gap-3 rounded-lg px-1 py-1 text-left hover:bg-white/5"
          >
            <span>
              <span className="text-sm font-semibold text-cream-50">{t("new.advanced")}</span>
              <span className="block text-xs text-cream-100/50">{t("new.advancedHint")}</span>
            </span>
            <LuChevronRight className={`icon text-cream-100/60 transition ${showAdvanced ? "rotate-90" : ""}`} aria-hidden />
          </button>

          {showAdvanced && (
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                label={t("new.variant")}
                hint={cfg.variant === "party" ? t("new.variantPartyHint", { max: MAX_POWERUPS }) : t("new.variantClassicHint")}
              >
                <Segmented
                  value={cfg.variant}
                  options={["classic", "party"] as const satisfies readonly Variant[]}
                  onChange={(variant) => patch({ variant })}
                  label={(vr) =>
                    vr === "party" ? (
                      <>
                        <LuDices className="icon" /> {t("variants.party")}
                      </>
                    ) : (
                      t("variants.classic")
                    )
                  }
                />
              </Field>
              <Field label={t("new.mode")} hint={cfg.mode === "session" ? t("new.modeSessionHint") : t("new.modeCampaignHint")}>
                <Segmented
                  value={cfg.mode}
                  options={["session", "campaign"] as const}
                  onChange={(mode) => patch({ mode, rosterSize: mode === "session" ? cfg.seats : Math.max(cfg.seats, cfg.rosterSize) })}
                  label={(m) => t(`modes.${m}`)}
                />
              </Field>
              <Field label={t("new.deck")} hint={t("new.seatsDynamic", { deck: cfg.deck, max: maxSeatsFor(cfg.deck) })}>
                <Segmented value={cfg.deck} options={[40, 52] as const} onChange={(deck) => patch({ deck })} label={(d) => `${d} ${t("new.cards")}`} />
              </Field>
              {cfg.mode === "campaign" && (
                <Field label={t("new.roster")}>
                  <input
                    type="number"
                    min={cfg.seats}
                    max={MAX_ROSTER}
                    value={cfg.rosterSize}
                    onChange={(e) => patch({ rosterSize: num(e.target.value) })}
                    className={`${inputCls} ${invalid("rosterRange")}`}
                  />
                </Field>
              )}
              <Field label={t("new.startingPoints")}>
                <input
                  type="number"
                  min={1}
                  value={cfg.startingPoints}
                  onChange={(e) => patch({ startingPoints: num(e.target.value) })}
                  className={`${inputCls} ${invalid("startingPoints")}`}
                />
              </Field>
              <Field label={t("new.threshold")} hint={t("new.thresholdHint")}>
                <input
                  type="number"
                  min={0}
                  max={cfg.startingPoints}
                  value={cfg.forcedPlayThreshold}
                  onChange={(e) => patch({ forcedPlayThreshold: num(e.target.value) })}
                  className={`${inputCls} ${invalid("forcedPlayThreshold")}`}
                />
              </Field>
              <Field label={t("new.blankPenalty")}>
                <input
                  type="number"
                  min={0}
                  value={cfg.blankPenalty}
                  onChange={(e) => patch({ blankPenalty: num(e.target.value) })}
                  className={`${inputCls} ${invalid("blankPenalty")}`}
                />
              </Field>
              <Field label={t("new.turnSeconds")}>
                <input
                  type="number"
                  min={10}
                  max={180}
                  value={cfg.turnSeconds}
                  onChange={(e) => patch({ turnSeconds: num(e.target.value) })}
                  className={`${inputCls} ${invalid("turnSeconds")}`}
                />
              </Field>
            </div>
          )}
        </div>
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-cream-100/70">{summary}</p>
        <Button onClick={() => void submit()} disabled={busy || errors.length > 0} className="px-7 py-3 text-base">
          {t("new.create")}
        </Button>
      </div>
    </div>
  );
}
