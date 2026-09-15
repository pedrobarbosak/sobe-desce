import { v } from "convex/values";

export const suit = v.union(v.literal("H"), v.literal("D"), v.literal("C"), v.literal("S"));
export const deckSize = v.union(v.literal(40), v.literal(52));
export const gameMode = v.union(v.literal("session"), v.literal("campaign"));
export const variant = v.union(v.literal("classic"), v.literal("party"));
export const presetId = v.union(
  v.literal("classic"),
  v.literal("normal"),
  v.literal("long"),
  v.literal("mesaGrande"),
  v.literal("party"),
  v.literal("liga"),
  v.literal("custom"),
);

export const gameConfig = v.object({
  preset: presetId,
  /** Absent on games created before the party variant existed: classic. */
  variant: v.optional(variant),
  deck: deckSize,
  startingPoints: v.number(),
  forcedPlayThreshold: v.number(),
  mode: gameMode,
  rosterSize: v.number(),
  seats: v.number(),
  blankPenalty: v.number(),
  turnSeconds: v.number(),
});

export const play = v.object({ seat: v.number(), card: v.string() });
export const trickInProgress = v.object({ leader: v.number(), plays: v.array(play) });
export const completedTrick = v.object({
  leader: v.number(),
  plays: v.array(play),
  winner: v.number(),
});

export const decision = v.union(v.literal("pending"), v.literal("in"), v.literal("out"));
export const phase = v.union(
  v.literal("trump"),
  v.literal("discard"),
  v.literal("pass"),
  v.literal("market"),
  v.literal("dummy"),
  v.literal("tricks"),
  v.literal("scored"),
);

export const participant = v.object({
  seat: v.number(),
  gamePlayerId: v.id("gamePlayers"),
  decision,
  discardCount: v.number(),
  handSize: v.number(),
  tricksWon: v.number(),
  scoreBefore: v.number(),
  delta: v.optional(v.number()),
  scoreAfter: v.optional(v.number()),
});

export const actor = v.union(
  v.literal("user"),
  v.literal("bot"),
  v.literal("timeout"),
  v.literal("organizer"),
);

export const twist = v.union(
  v.literal("desce"),
  v.literal("golden"),
  v.literal("lastTrick"),
  v.literal("blankPays"),
  v.literal("noTrump"),
  v.literal("openHands"),
  v.literal("pass"),
  /** Legacy id of `pass`, kept so stored rounds still validate. */
  v.literal("passLeft"),
  v.literal("allIn"),
  v.literal("lightning"),
  v.literal("asDealt"),
  v.literal("swap"),
  v.literal("guardian"),
  v.literal("freeForAll"),
  v.literal("wildRank"),
  v.literal("carousel"),
  v.literal("market"),
  v.literal("dummy"),
  v.literal("faceUp"),
  v.literal("inverted"),
);
export const passDirection = v.union(v.literal("left"), v.literal("right"), v.literal("across"));
export const powerup = v.union(v.literal("peek"), v.literal("curse"), v.literal("shield"));

/** The public half of a party round. Inventories live on `gamePlayers.powerups`. */
export const partyRound = v.object({
  twist,
  goldenSuit: v.optional(suit),
  pass: v.optional(v.object({ count: v.number(), direction: passDirection })),
  wildRank: v.optional(v.string()),
  swapOffset: v.optional(v.number()),
  faceUpIndex: v.optional(v.array(v.number())),
  /** The guardian cycle. Public on the document; the table query filters it per viewer. */
  guardians: v.optional(v.array(v.number())),
  faceUp: v.optional(v.array(v.union(v.string(), v.null()))),
  market: v.optional(v.array(v.string())),
  marketOrder: v.optional(v.array(v.number())),
  dummy: v.optional(v.array(v.string())),
  dummyTurn: v.optional(v.number()),
  shielded: v.array(v.boolean()),
  curses: v.array(v.number()),
  peeks: v.array(v.object({ seat: v.number(), target: v.number() })),
  /** Set when the round is scored: who drew what. */
  awards: v.optional(v.array(v.object({ seat: v.number(), powerup }))),
});
