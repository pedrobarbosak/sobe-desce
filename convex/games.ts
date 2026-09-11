import { ConvexError, v } from "convex/values";
import { MIN_SEATS, validateConfig } from "../src/engine";
import { randomBotName, randomSeed, randomTableName } from "../src/shared/names";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { type MutationCtx, type QueryCtx, mutation, query } from "./_generated/server";
import { BOT_DELAY_MS } from "./game/advance";
import { currentUser, requireUser } from "./lib/auth";
import { generateCode, normalizeCode } from "./lib/code";
import { handSeatToBot } from "./game/seat";
import { closeSession, humanSeatCount } from "./game/session";
import { gameConfig } from "./lib/validators";
import { PRESENCE_TTL_MS } from "./presence";

export async function loadGame(ctx: QueryCtx | MutationCtx, gameId: Id<"games">): Promise<Doc<"games">> {
  const game = await ctx.db.get(gameId);
  if (!game) throw new ConvexError({ code: "notFound" });
  return game;
}

export async function rosterOf(ctx: QueryCtx | MutationCtx, gameId: Id<"games">) {
  return await ctx.db
    .query("gamePlayers")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
}

export async function myMembership(
  ctx: QueryCtx | MutationCtx,
  gameId: Id<"games">,
  userId: Id<"users">,
): Promise<Doc<"gamePlayers"> | null> {
  return await ctx.db
    .query("gamePlayers")
    .withIndex("by_game_user", (q) => q.eq("gameId", gameId).eq("userId", userId))
    .unique();
}

export function assertOwner(game: Doc<"games">, userId: Id<"users">) {
  if (game.ownerId !== userId) throw new ConvexError({ code: "notOwner" });
}

async function uniqueCode(ctx: MutationCtx): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = generateCode();
    const clash = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();
    if (!clash) return code;
  }
  throw new Error("Could not allocate an invite code");
}

async function insertPlayer(
  ctx: MutationCtx,
  game: Doc<"games">,
  fields: { userId?: Id<"users">; isBot: boolean; name: string; avatarSeed: string },
): Promise<Id<"gamePlayers">> {
  return await ctx.db.insert("gamePlayers", {
    gameId: game._id,
    ...fields,
    score: game.config.startingPoints,
    roundsPlayed: 0,
    sessionsPlayed: 0,
    lastDelta: 0,
    status: "active",
    checkedIn: game.mode === "session",
    joinedAt: Date.now(),
  });
}

export const create = mutation({
  args: { name: v.optional(v.string()), config: gameConfig },
  handler: async (ctx, { name, config }) => {
    const user = await requireUser(ctx);
    const errors = validateConfig(config);
    if (errors.length > 0) throw new ConvexError({ code: "invalidConfig", errors });
    const code = await uniqueCode(ctx);
    const gameId = await ctx.db.insert("games", {
      code,
      name: (name ?? "").trim().slice(0, 40) || randomTableName(),
      mode: config.mode,
      config,
      status: "lobby",
      ownerId: user._id,
      createdAt: Date.now(),
    });
    const game = (await ctx.db.get(gameId))!;
    await insertPlayer(ctx, game, {
      userId: user._id,
      isBot: false,
      name: user.displayName,
      avatarSeed: user.avatarSeed,
    });
    return { gameId, code };
  },
});

export const byCode = query({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
      .unique();
    if (!game) return null;
    const roster = await rosterOf(ctx, game._id);
    return {
      gameId: game._id,
      name: game.name,
      mode: game.mode,
      status: game.status,
      config: game.config,
      playerCount: roster.filter((p) => p.status === "active").length,
    };
  },
});

export const joinByCode = mutation({
  args: { code: v.string() },
  handler: async (ctx, { code }) => {
    const user = await requireUser(ctx);
    const game = await ctx.db
      .query("games")
      .withIndex("by_code", (q) => q.eq("code", normalizeCode(code)))
      .unique();
    if (!game) throw new ConvexError({ code: "notFound" });
    const existing = await myMembership(ctx, game._id, user._id);
    if (existing) {
      if (existing.status === "left" && game.status !== "finished") {
        await ctx.db.patch(existing._id, { status: "active" });
      }
      return { gameId: game._id };
    }
    if (game.status === "finished") throw new ConvexError({ code: "gameFinished" });
    if (game.mode === "session" && game.status !== "lobby") {
      throw new ConvexError({ code: "gameStarted" });
    }
    const roster = (await rosterOf(ctx, game._id)).filter((p) => p.status === "active");
    if (roster.length >= game.config.rosterSize) throw new ConvexError({ code: "gameFull" });
    await insertPlayer(ctx, game, {
      userId: user._id,
      isBot: false,
      name: user.displayName,
      avatarSeed: user.avatarSeed,
    });
    return { gameId: game._id };
  },
});

export const get = query({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await currentUser(ctx);
    const game = await ctx.db.get(gameId);
    if (!game) return null;
    const roster = await rosterOf(ctx, gameId);
    const presence = await ctx.db
      .query("presence")
      .withIndex("by_game", (q) => q.eq("gameId", gameId))
      .collect();
    const now = Date.now();
    const online = new Set(
      presence.filter((p) => now - p.lastSeenAt < PRESENCE_TTL_MS).map((p) => p.userId),
    );
    const session = game.currentSessionId ? await ctx.db.get(game.currentSessionId) : null;
    const players = roster
      .filter((p) => p.status === "active")
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({
        _id: p._id,
        userId: p.userId,
        name: p.name,
        avatarSeed: p.avatarSeed,
        isBot: p.isBot,
        botControlled: p.botControlled === true,
        botReason: p.botReason ?? null,
        score: p.score,
        roundsPlayed: p.roundsPlayed,
        sessionsPlayed: p.sessionsPlayed,
        lastDelta: p.lastDelta,
        checkedIn: p.checkedIn,
        online: p.isBot || (p.userId !== undefined && online.has(p.userId)),
        isMe: user !== null && p.userId === user._id,
        seat: session ? session.seats.indexOf(p._id) : -1,
      }));
    const me = user ? players.find((p) => p.isMe) ?? null : null;
    return {
      game: {
        _id: game._id,
        code: game.code,
        name: game.name,
        mode: game.mode,
        config: game.config,
        status: game.status,
        ownerId: game.ownerId,
        winnerPlayerId: game.winnerPlayerId,
        rematchGameId: game.rematchGameId,
        createdAt: game.createdAt,
        finishedAt: game.finishedAt,
      },
      players,
      me,
      isOwner: user !== null && game.ownerId === user._id,
      session: session
        ? {
            _id: session._id,
            index: session.index,
            status: session.status,
            seats: session.seats,
            hostPlayerId: session.hostPlayerId ?? null,
            seatCount: session.seatCount,
            maxDiscard: session.maxDiscard,
            dealerSeat: session.dealerSeat,
            currentRoundId: session.currentRoundId,
            roundsPlayed: session.roundsPlayed,
            manual: session.manual,
          }
        : null,
    };
  },
});

/** Lobbies with free seats, newest first, for the homepage. */
export const openTables = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    const since = Date.now() - 1000 * 60 * 60 * 24;
    const games = await ctx.db
      .query("games")
      .withIndex("by_status", (q) => q.eq("status", "lobby"))
      .order("desc")
      .take(40);
    const out = [];
    for (const g of games) {
      if (g.createdAt < since) continue;
      const roster = (await rosterOf(ctx, g._id)).filter((p) => p.status === "active");
      if (roster.length >= g.config.rosterSize) continue;
      if (user && roster.some((p) => p.userId === user._id)) continue;
      const owner = await ctx.db.get(g.ownerId);
      out.push({
        gameId: g._id,
        code: g.code,
        name: g.name,
        mode: g.mode,
        preset: g.config.preset,
        deck: g.config.deck,
        startingPoints: g.config.startingPoints,
        seats: g.config.seats,
        rosterSize: g.config.rosterSize,
        playerCount: roster.length,
        hostName: owner?.displayName ?? "?",
        hostAvatar: owner?.avatarSeed ?? "x",
        createdAt: g.createdAt,
      });
      if (out.length >= 20) break;
    }
    return out;
  },
});

/**
 * The sitting the caller is seated at right now, if any. Drives the "you have a game in
 * progress" banner, so it stays cheap: one membership scan and one session read.
 */
export const ongoing = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return null;
    const memberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    for (const m of memberships) {
      if (m.status !== "active" || m.botControlled === true) continue;
      const game = await ctx.db.get(m.gameId);
      if (!game || game.status !== "active" || !game.currentSessionId) continue;
      const session = await ctx.db.get(game.currentSessionId);
      if (!session || session.status !== "active") continue;
      if (!session.seats.includes(m._id)) continue;
      const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
      const seat = session.seats.indexOf(m._id);
      return {
        gameId: game._id,
        name: game.name,
        roundIndex: round?.index ?? 0,
        isMyTurn: round?.turnSeat === seat && round.phase !== "scored",
      };
    }
    return null;
  },
});

export const myGames = query({
  args: {},
  handler: async (ctx) => {
    const user = await currentUser(ctx);
    if (!user) return [];
    const memberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
    const out = [];
    for (const m of memberships) {
      if (m.status !== "active") continue;
      const game = await ctx.db.get(m.gameId);
      if (!game) continue;
      out.push({
        gameId: game._id,
        code: game.code,
        name: game.name,
        mode: game.mode,
        status: game.status,
        score: m.score,
        createdAt: game.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const leave = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    const me = await myMembership(ctx, gameId, user._id);
    if (!me) return;
    if (game.mode === "session" && game.status === "lobby") {
      await ctx.db.delete(me._id);
      if (await noHumansLeft(ctx, gameId)) await deleteGameCascade(ctx, gameId);
      return;
    }
    await ctx.db.patch(me._id, { status: "left", checkedIn: false });
    if (await noHumansLeft(ctx, gameId)) {
      await deleteGameCascade(ctx, gameId);
      return;
    }
    // Leaving mid-sitting hands the seat to the server; if it is their turn, act now.
    if (game.status === "active" && game.currentSessionId) {
      const session = await ctx.db.get(game.currentSessionId);
      const seat = session?.seats.indexOf(me._id) ?? -1;
      if (session?.status === "active" && seat >= 0) {
        if (game.mode === "campaign" && (await humanSeatCount(ctx, session)) < MIN_SEATS) {
          await closeSession(ctx, session);
          return;
        }
        if (session.currentRoundId) {
          const round = await ctx.db.get(session.currentRoundId);
          if (round && round.turnSeat === seat && round.phase !== "scored") {
            await ctx.scheduler.runAfter(BOT_DELAY_MS, internal.game.bots.act, { roundId: round._id, nonce: round.turnNonce });
          }
        }
      }
    }
  },
});

/** Give up your own seat mid-sitting; a bot finishes the sitting for you. */
export const abandonSeat = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    const me = await myMembership(ctx, gameId, user._id);
    if (!me) throw new ConvexError({ code: "notInGame" });
    await handSeatToBot(ctx, game, me, "abandoned");
  },
});

/** Host only: replace a seated player with a bot that keeps their points. */
export const kickToBot = mutation({
  args: { gameId: v.id("games"), playerId: v.id("gamePlayers") },
  handler: async (ctx, { gameId, playerId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== gameId) throw new ConvexError({ code: "notFound" });
    if (player.userId === user._id) throw new ConvexError({ code: "cannotRemoveSelf" });
    if (player.isBot) throw new ConvexError({ code: "alreadyBot" });
    await handSeatToBot(ctx, game, player, "kicked");
  },
});

/**
 * Wipe a game and everything hanging off it. Scheduled functions that were pointing at the
 * deleted rows all start with a lookup, so they turn into no-ops on their own.
 */
async function deleteGameCascade(ctx: MutationCtx, gameId: Id<"games">): Promise<void> {
  const rounds = await ctx.db
    .query("rounds")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .collect();
  for (const round of rounds) {
    for (const hand of await ctx.db.query("hands").withIndex("by_round", (q) => q.eq("roundId", round._id)).collect()) {
      await ctx.db.delete(hand._id);
    }
    for (const secret of await ctx.db.query("roundSecrets").withIndex("by_round", (q) => q.eq("roundId", round._id)).collect()) {
      await ctx.db.delete(secret._id);
    }
    for (const action of await ctx.db.query("actions").withIndex("by_round_seq", (q) => q.eq("roundId", round._id)).collect()) {
      await ctx.db.delete(action._id);
    }
    await ctx.db.delete(round._id);
  }
  for (const session of await ctx.db.query("sessions").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect()) {
    await ctx.db.delete(session._id);
  }
  for (const player of await rosterOf(ctx, gameId)) await ctx.db.delete(player._id);
  for (const row of await ctx.db.query("presence").withIndex("by_game", (q) => q.eq("gameId", gameId)).collect()) {
    await ctx.db.delete(row._id);
  }
  await ctx.db.delete(gameId);
}

/** Nobody but bots is still enrolled, so the table is not worth keeping. */
async function noHumansLeft(ctx: MutationCtx, gameId: Id<"games">): Promise<boolean> {
  const roster = await rosterOf(ctx, gameId);
  return roster.filter((p) => p.status === "active").every((p) => p.isBot);
}

/** Host only: throw the table away, along with its rounds, hands and history. */
export const remove = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    await deleteGameCascade(ctx, gameId);
  },
});

/**
 * Campaign: fold a name the organizer typed into the account of the person it belongs to.
 * The typed row keeps the history (it is the one referenced by every past round and
 * sitting) and gains the account; the account's own empty row goes away.
 */
export const linkPlayer = mutation({
  args: {
    gameId: v.id("games"),
    manualPlayerId: v.id("gamePlayers"),
    accountPlayerId: v.id("gamePlayers"),
  },
  handler: async (ctx, { gameId, manualPlayerId, accountPlayerId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    if (game.mode !== "campaign") throw new ConvexError({ code: "campaignOnly" });
    if (manualPlayerId === accountPlayerId) throw new ConvexError({ code: "cannotLinkSelf" });

    const manual = await ctx.db.get(manualPlayerId);
    const account = await ctx.db.get(accountPlayerId);
    if (!manual || !account || manual.gameId !== gameId || account.gameId !== gameId) {
      throw new ConvexError({ code: "notFound" });
    }
    if (manual.isBot || account.isBot) throw new ConvexError({ code: "cannotLinkBot" });
    if (manual.userId !== undefined) throw new ConvexError({ code: "alreadyLinked" });
    if (account.userId === undefined) throw new ConvexError({ code: "notAnAccount" });
    // Two histories cannot be added up without guessing; the organizer must pick one.
    if (account.roundsPlayed > 0) throw new ConvexError({ code: "accountHasHistory" });

    const session = game.currentSessionId ? await ctx.db.get(game.currentSessionId) : null;
    const live = session?.status === "active" ? session : null;
    if (live && live.seats.includes(account._id)) {
      throw new ConvexError({ code: "seatedInActiveSession" });
    }

    await ctx.db.patch(manual._id, {
      userId: account.userId,
      name: account.name,
      avatarSeed: account.avatarSeed,
      status: "active",
      checkedIn: manual.checkedIn || account.checkedIn,
    });
    // If the typed player is sitting at a live table, their hand has to answer to the
    // account from now on, otherwise the newly linked person cannot play the round.
    if (live?.currentRoundId && live.seats.includes(manual._id)) {
      const hand = await ctx.db
        .query("hands")
        .withIndex("by_round_player", (q) => q.eq("roundId", live.currentRoundId!).eq("gamePlayerId", manual._id))
        .unique();
      if (hand) await ctx.db.patch(hand._id, { userId: account.userId });
    }
    await ctx.db.delete(account._id);
    return { playerId: manual._id };
  },
});

/**
 * Campaign: put a roster member on a given score. Made for latecomers, who would otherwise
 * start a league on the full starting points while everybody else is halfway down.
 */
export const setScore = mutation({
  args: { gameId: v.id("games"), playerId: v.id("gamePlayers"), score: v.number() },
  handler: async (ctx, { gameId, playerId, score }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    if (game.mode !== "campaign") throw new ConvexError({ code: "campaignOnly" });
    if (!Number.isInteger(score) || score < 1 || score > game.config.startingPoints) {
      throw new ConvexError({ code: "scoreOutOfRange", max: game.config.startingPoints });
    }
    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== gameId) throw new ConvexError({ code: "notFound" });
    // A seated player's score is already baked into the round in progress.
    if (game.currentSessionId) {
      const session = await ctx.db.get(game.currentSessionId);
      if (session?.status === "active" && session.seats.includes(playerId)) {
        throw new ConvexError({ code: "seatedInActiveSession" });
      }
    }
    await ctx.db.patch(playerId, { score, lastDelta: 0 });
  },
});

export const addBot = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    if (game.status === "finished") throw new ConvexError({ code: "gameFinished" });
    const roster = (await rosterOf(ctx, gameId)).filter((p) => p.status === "active");
    if (roster.length >= game.config.rosterSize) throw new ConvexError({ code: "gameFull" });
    const taken = (await rosterOf(ctx, gameId)).map((p) => p.name);
    await insertPlayer(ctx, game, { isBot: true, name: randomBotName(taken), avatarSeed: randomSeed() });
  },
});

export const addManualPlayer = mutation({
  args: { gameId: v.id("games"), name: v.string() },
  handler: async (ctx, { gameId, name }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    if (game.mode !== "campaign") throw new ConvexError({ code: "campaignOnly" });
    if (game.status === "finished") throw new ConvexError({ code: "gameFinished" });
    const roster = (await rosterOf(ctx, gameId)).filter((p) => p.status === "active");
    if (roster.length >= game.config.rosterSize) throw new ConvexError({ code: "gameFull" });
    const clean = name.trim().slice(0, 24);
    if (clean.length < 2) throw new ConvexError({ code: "invalidName" });
    await insertPlayer(ctx, game, { isBot: false, name: clean, avatarSeed: randomSeed() });
  },
});

export const removePlayer = mutation({
  args: { gameId: v.id("games"), playerId: v.id("gamePlayers") },
  handler: async (ctx, { gameId, playerId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    const player = await ctx.db.get(playerId);
    if (!player || player.gameId !== gameId) throw new ConvexError({ code: "notFound" });
    if (player.userId === user._id) throw new ConvexError({ code: "cannotRemoveSelf" });
    if (game.status === "active" && game.currentSessionId) {
      const session = await ctx.db.get(game.currentSessionId);
      if (session?.status === "active" && session.seats.includes(playerId)) {
        throw new ConvexError({ code: "seatedInActiveSession" });
      }
    }
    if (game.status === "lobby" || player.roundsPlayed === 0) {
      await ctx.db.delete(playerId);
    } else {
      await ctx.db.patch(playerId, { status: "left", checkedIn: false });
    }
  },
});

/** Campaign: raise or lower your hand for the next sitting. */
export const setCheckedIn = mutation({
  args: { gameId: v.id("games"), playerId: v.optional(v.id("gamePlayers")), checkedIn: v.boolean() },
  handler: async (ctx, { gameId, playerId, checkedIn }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    let target: Doc<"gamePlayers"> | null;
    if (playerId) {
      target = await ctx.db.get(playerId);
      if (!target || target.gameId !== gameId) throw new ConvexError({ code: "notFound" });
      if (target.userId !== user._id) assertOwner(game, user._id);
    } else {
      target = await myMembership(ctx, gameId, user._id);
    }
    if (!target) throw new ConvexError({ code: "notInGame" });
    await ctx.db.patch(target._id, { checkedIn });
  },
});

export const rename = mutation({
  args: { gameId: v.id("games"), name: v.string() },
  handler: async (ctx, { gameId, name }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    assertOwner(game, user._id);
    await ctx.db.patch(gameId, { name: name.trim().slice(0, 40) || game.name });
  },
});

/**
 * Play again: a fresh game with the same config and the same roster (humans and bots).
 * Idempotent: a second call returns the rematch already created.
 */
export const rematch = mutation({
  args: { gameId: v.id("games") },
  handler: async (ctx, { gameId }) => {
    const user = await requireUser(ctx);
    const game = await loadGame(ctx, gameId);
    if (game.rematchGameId) return { gameId: game.rematchGameId };
    assertOwner(game, user._id);
    if (game.status !== "finished") throw new ConvexError({ code: "gameNotFinished" });
    const code = await uniqueCode(ctx);
    const newId = await ctx.db.insert("games", {
      code,
      name: game.name,
      mode: game.mode,
      config: game.config,
      status: "lobby",
      ownerId: game.ownerId,
      createdAt: Date.now(),
    });
    const fresh = (await ctx.db.get(newId))!;
    const roster = (await rosterOf(ctx, gameId)).filter((p) => p.status === "active");
    for (const p of roster) {
      await insertPlayer(ctx, fresh, { userId: p.userId, isBot: p.isBot, name: p.name, avatarSeed: p.avatarSeed });
    }
    await ctx.db.patch(gameId, { rematchGameId: newId });
    return { gameId: newId };
  },
});

export { MIN_SEATS };
