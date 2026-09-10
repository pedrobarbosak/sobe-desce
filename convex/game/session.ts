import type { Doc } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

/**
 * End a sitting. A round still in progress is abandoned rather than scored: nobody played
 * it out, so inventing a result would be worse than dropping it. Rounds already scored keep
 * their points, which live on the roster.
 */
export async function closeSession(ctx: MutationCtx, session: Doc<"sessions">): Promise<void> {
  if (session.status !== "active") return;
  const round = session.currentRoundId ? await ctx.db.get(session.currentRoundId) : null;
  if (round && round.phase !== "scored") {
    if (round.timerId) await ctx.scheduler.cancel(round.timerId).catch(() => {});
    await ctx.db.patch(round._id, {
      phase: "scored",
      turnSeat: null,
      turnNonce: round.turnNonce + 1,
      turnDeadline: undefined,
      timerId: undefined,
      deltas: round.participants.map(() => 0),
      scoredAt: Date.now(),
    });
  }
  await ctx.db.patch(session._id, { status: "finished", endedAt: Date.now() });
  await ctx.db.patch(session.gameId, { currentSessionId: undefined });
  for (const playerId of session.seats) {
    const player = await ctx.db.get(playerId);
    if (player?.checkedIn) await ctx.db.patch(playerId, { checkedIn: false });
  }
}

/** Seats still answering to a person, rather than to a stand-in bot. */
export async function humanSeatCount(ctx: MutationCtx, session: Doc<"sessions">): Promise<number> {
  let n = 0;
  for (const playerId of session.seats) {
    const player = await ctx.db.get(playerId);
    if (!player || player.isBot || player.botControlled === true) continue;
    if (player.status === "left" || player.userId === undefined) continue;
    n++;
  }
  return n;
}
