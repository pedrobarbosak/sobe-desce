import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  actor,
  completedTrick,
  gameConfig,
  gameMode,
  participant,
  phase,
  suit,
  trickInProgress,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({
    authId: v.string(),
    displayName: v.string(),
    avatarSeed: v.string(),
    isAnonymous: v.boolean(),
    email: v.optional(v.string()),
    locale: v.optional(v.union(v.literal("pt"), v.literal("en"))),
  })
    .index("by_authId", ["authId"])
    .index("by_email", ["email"]),

  games: defineTable({
    code: v.string(),
    name: v.string(),
    mode: gameMode,
    config: gameConfig,
    status: v.union(v.literal("lobby"), v.literal("active"), v.literal("finished")),
    ownerId: v.id("users"),
    currentSessionId: v.optional(v.id("sessions")),
    winnerPlayerId: v.optional(v.id("gamePlayers")),
    rematchGameId: v.optional(v.id("games")),
    createdAt: v.number(),
    finishedAt: v.optional(v.number()),
  })
    .index("by_code", ["code"])
    .index("by_owner", ["ownerId"])
    .index("by_status", ["status"]),

  /** The roster. Score is persistent; in campaign mode it carries across sessions. */
  gamePlayers: defineTable({
    gameId: v.id("games"),
    userId: v.optional(v.id("users")),
    isBot: v.boolean(),
    name: v.string(),
    avatarSeed: v.string(),
    score: v.number(),
    roundsPlayed: v.number(),
    sessionsPlayed: v.number(),
    lastDelta: v.number(),
    status: v.union(v.literal("active"), v.literal("left")),
    /** A bot plays this seat: the human abandoned, was kicked, or dropped off. */
    botControlled: v.optional(v.boolean()),
    /** Why the bot took over, for the table to explain itself. */
    botReason: v.optional(v.union(v.literal("abandoned"), v.literal("kicked"), v.literal("disconnected"))),
    /** Campaign: raised a hand for the next sitting. */
    checkedIn: v.boolean(),
    joinedAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_user", ["userId"])
    .index("by_game_user", ["gameId", "userId"]),

  /** One sitting. Session games have exactly one. */
  sessions: defineTable({
    gameId: v.id("games"),
    index: v.number(),
    status: v.union(v.literal("active"), v.literal("finished")),
    manual: v.boolean(),
    /** Who opened this sitting. Not always the table owner: campaigns run without them. */
    hostPlayerId: v.optional(v.id("gamePlayers")),
    seats: v.array(v.id("gamePlayers")),
    seatCount: v.number(),
    maxDiscard: v.number(),
    dealerSeat: v.number(),
    sitOutStreak: v.array(v.number()),
    currentRoundId: v.optional(v.id("rounds")),
    roundsPlayed: v.number(),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    note: v.optional(v.string()),
  })
    .index("by_game", ["gameId"])
    .index("by_game_status", ["gameId", "status"]),

  /** Public round state. Contains no secrets. */
  rounds: defineTable({
    sessionId: v.id("sessions"),
    gameId: v.id("games"),
    index: v.number(),
    dealerSeat: v.number(),
    trump: v.optional(suit),
    /** Seat that settled the trump, by naming it or by flipping for it. */
    trumpSeat: v.optional(v.number()),
    /** The card that set the trump when it was flipped. Public, and dealt to the flipper. */
    flippedCard: v.optional(v.string()),
    /** Hearts called blind: the round counts fourfold. */
    darkHearts: v.optional(v.boolean()),
    /** While set and in the future, the deciding seat has not been shown their cards. */
    darkUntil: v.optional(v.number()),
    phase,
    turnSeat: v.union(v.number(), v.null()),
    turnNonce: v.number(),
    turnDeadline: v.optional(v.number()),
    timerId: v.optional(v.id("_scheduled_functions")),
    participants: v.array(participant),
    currentTrick: trickInProgress,
    completedTricks: v.array(completedTrick),
    deltas: v.optional(v.array(v.number())),
    winnerSeat: v.optional(v.number()),
    startedAt: v.number(),
    scoredAt: v.optional(v.number()),
  })
    .index("by_session", ["sessionId"])
    .index("by_session_index", ["sessionId", "index"])
    .index("by_game", ["gameId"]),

  /** PRIVATE: only ever returned to its owner. */
  hands: defineTable({
    roundId: v.id("rounds"),
    gamePlayerId: v.id("gamePlayers"),
    userId: v.optional(v.id("users")),
    seat: v.number(),
    cards: v.array(v.string()),
  })
    .index("by_round", ["roundId"])
    .index("by_round_player", ["roundId", "gamePlayerId"])
    .index("by_round_user", ["roundId", "userId"]),

  /** SERVER-ONLY: never read from a query. */
  roundSecrets: defineTable({
    roundId: v.id("rounds"),
    seed: v.number(),
    drawPile: v.array(v.string()),
  }).index("by_round", ["roundId"]),

  /** Per-round action log; payloads are redacted at write time. */
  actions: defineTable({
    roundId: v.id("rounds"),
    sessionId: v.id("sessions"),
    gameId: v.id("games"),
    seq: v.number(),
    at: v.number(),
    seat: v.number(),
    actor,
    type: v.string(),
    payload: v.any(),
  })
    .index("by_round_seq", ["roundId", "seq"])
    .index("by_session", ["sessionId"]),

  presence: defineTable({
    gameId: v.id("games"),
    userId: v.id("users"),
    lastSeenAt: v.number(),
  })
    .index("by_game", ["gameId"])
    .index("by_game_user", ["gameId", "userId"]),
});
