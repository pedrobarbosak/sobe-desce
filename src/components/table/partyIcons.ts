import type { Twist } from "@/engine";

/** One stable, recognizable mark per Party event, shared by the table and Rules page. */
export const PARTY_TWIST_ICONS: Record<Twist, string> = {
  desce: "⬇️",
  golden: "✨",
  lastTrick: "🏁",
  blankPays: "0️⃣",
  noTrump: "🚫",
  pass: "↪️",
  lightning: "⚡",
  asDealt: "🎴",
  swap: "🔀",
  guardian: "🛡️",
  freeForAll: "💥",
  wildRank: "🃏",
  carousel: "🎠",
  market: "🏪",
  dummy: "🖐️",
  faceUp: "👁️",
  inverted: "🙃",
  // These two are implemented but currently outside the draw pool.
  openHands: "👐",
  allIn: "📣",
};
