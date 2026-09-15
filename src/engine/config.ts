import type { DeckSize } from "./cards";

export type GameMode = "session" | "campaign";
/** Classic is the game as played at the table. Party layers round twists and powerups on top. */
export type Variant = "classic" | "party";
/** `normal`, `long` and `mesaGrande` are legacy ids kept so stored games still name themselves. */
export type PresetId = "classic" | "party" | "liga" | "custom" | "normal" | "long" | "mesaGrande";
/** The presets the new-game page offers. */
export const OFFERED_PRESETS: readonly PresetId[] = ["classic", "party", "liga"];

export type GameConfig = {
  preset: PresetId;
  variant: Variant;
  deck: DeckSize;
  /** Everyone starts here and races down to exactly 0. */
  startingPoints: number;
  /** Below this score a player may no longer sit out. */
  forcedPlayThreshold: number;
  mode: GameMode;
  /** Enrolled players. Equal to `seats` in session mode; up to MAX_ROSTER in campaign mode. */
  rosterSize: number;
  /** Maximum players at the table at once. */
  seats: number;
  /** Points awarded for being in the round and winning no tricks (default 5). */
  blankPenalty: number;
  /** Per-turn timer; on expiry the lowest legal card is auto-played. */
  turnSeconds: number;
};

/** Stored configs from before the party variant have no `variant`; they are classic. */
export function variantOf(cfg: { variant?: Variant }): Variant {
  return cfg.variant ?? "classic";
}

export const MAX_ROSTER = 16;
export const MIN_SEATS = 4;
export const HAND_SIZE = 5;
export const TRICKS_PER_ROUND = 5;
export const MAX_CONSECUTIVE_SIT_OUTS = 2;

export function maxSeatsFor(deck: DeckSize): number {
  return deck === 40 ? 6 : 8;
}

/** clamp(floor(deckSize / seated) - 5, 1, 5); null when the raw value is below 1. */
export function discardCapFor(deck: DeckSize, seated: number): number | null {
  if (seated < 1) return null;
  const raw = Math.floor(deck / seated) - 5;
  if (raw < 1) return null;
  return Math.min(5, raw);
}

/** Same as discardCapFor but throws for impossible seat counts. */
export function maxDiscard(deck: DeckSize, seated: number): number {
  const cap = discardCapFor(deck, seated);
  if (cap === null) {
    throw new Error(`A ${deck}-card deck cannot seat ${seated} players`);
  }
  return cap;
}

export function isSeatCountAllowed(deck: DeckSize, seated: number): boolean {
  return seated >= MIN_SEATS && seated <= maxSeatsFor(deck) && discardCapFor(deck, seated) !== null;
}

/** 25% of the starting points, at least 1. */
export function defaultThreshold(startingPoints: number): number {
  return Math.max(1, Math.round(startingPoints * 0.25));
}

export const DEFAULT_TURN_SECONDS = 30;
export const DEFAULT_BLANK_PENALTY = 5;

type PresetShape = Omit<GameConfig, "preset" | "forcedPlayThreshold" | "blankPenalty" | "turnSeconds">;

export const PRESETS: Record<Exclude<PresetId, "custom">, PresetShape> = {
  classic: { variant: "classic", deck: 40, startingPoints: 20, mode: "session", rosterSize: 4, seats: 4 },
  /** Short and loud: twists every round, powerups, and a score that a single evening can reach. */
  party: { variant: "party", deck: 52, startingPoints: 12, mode: "session", rosterSize: 8, seats: 8 },
  liga: { variant: "classic", deck: 40, startingPoints: 1000, mode: "campaign", rosterSize: MAX_ROSTER, seats: 6 },
  normal: { variant: "classic", deck: 40, startingPoints: 20, mode: "session", rosterSize: 4, seats: 4 },
  long: { variant: "classic", deck: 40, startingPoints: 30, mode: "session", rosterSize: 4, seats: 4 },
  mesaGrande: { variant: "classic", deck: 52, startingPoints: 20, mode: "session", rosterSize: 6, seats: 6 },
};

export function configFromPreset(preset: PresetId, overrides: Partial<GameConfig> = {}): GameConfig {
  const base = preset === "custom" ? PRESETS.classic : PRESETS[preset];
  const startingPoints = overrides.startingPoints ?? base.startingPoints;
  const mode = overrides.mode ?? base.mode;
  const seats = overrides.seats ?? base.seats;
  const rosterSize = overrides.rosterSize ?? (mode === "session" ? seats : base.rosterSize);
  return {
    preset,
    variant: overrides.variant ?? base.variant,
    deck: overrides.deck ?? base.deck,
    startingPoints,
    forcedPlayThreshold: overrides.forcedPlayThreshold ?? defaultThreshold(startingPoints),
    mode,
    rosterSize: mode === "session" ? seats : rosterSize,
    seats,
    blankPenalty: overrides.blankPenalty ?? DEFAULT_BLANK_PENALTY,
    turnSeconds: overrides.turnSeconds ?? DEFAULT_TURN_SECONDS,
  };
}

export type ConfigError =
  | "variant"
  | "deck"
  | "startingPoints"
  | "forcedPlayThreshold"
  | "seatsRange"
  | "seatsDiscard"
  | "rosterRange"
  | "rosterSession"
  | "blankPenalty"
  | "turnSeconds";

const isInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n);

/** Returns a list of error codes; empty means valid. */
export function validateConfig(cfg: GameConfig): ConfigError[] {
  const errors: ConfigError[] = [];
  if (cfg.variant !== "classic" && cfg.variant !== "party") errors.push("variant");
  if (cfg.deck !== 40 && cfg.deck !== 52) errors.push("deck");
  if (!isInt(cfg.startingPoints) || cfg.startingPoints < 1) errors.push("startingPoints");
  if (
    !isInt(cfg.forcedPlayThreshold) ||
    cfg.forcedPlayThreshold < 0 ||
    cfg.forcedPlayThreshold > cfg.startingPoints
  ) {
    errors.push("forcedPlayThreshold");
  }
  if (cfg.deck === 40 || cfg.deck === 52) {
    if (!isInt(cfg.seats) || cfg.seats < MIN_SEATS || cfg.seats > maxSeatsFor(cfg.deck)) {
      errors.push("seatsRange");
    } else if (discardCapFor(cfg.deck, cfg.seats) === null) {
      errors.push("seatsDiscard");
    }
  }
  if (!isInt(cfg.rosterSize) || cfg.rosterSize < MIN_SEATS || cfg.rosterSize > MAX_ROSTER) {
    errors.push("rosterRange");
  } else if (cfg.mode === "session" && cfg.rosterSize !== cfg.seats) {
    errors.push("rosterSession");
  } else if (cfg.mode === "campaign" && cfg.rosterSize < cfg.seats) {
    errors.push("rosterRange");
  }
  if (!isInt(cfg.blankPenalty) || cfg.blankPenalty < 0) errors.push("blankPenalty");
  if (!isInt(cfg.turnSeconds) || cfg.turnSeconds < 10 || cfg.turnSeconds > 180) {
    errors.push("turnSeconds");
  }
  return errors;
}
