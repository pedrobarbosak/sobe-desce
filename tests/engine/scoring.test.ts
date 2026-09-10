import { describe, expect, it } from "vitest";
import { applyDeltas, roundDeltas, scoreMultiplier } from "@/engine";

const results = (tricks: (number | null)[]) =>
  tricks.map((t, seat) => ({ seat, participated: t !== null, tricksWon: t ?? 0 }));

describe("roundDeltas", () => {
  it("-1 per trick, +5 for a blank, 0 for sitting out", () => {
    const d = roundDeltas(results([3, 2, 0, null]), "S", 5);
    expect([...d.values()]).toEqual([-3, -2, 5, 0]);
  });
  it("hearts doubles everything", () => {
    const d = roundDeltas(results([3, 2, 0, null]), "H", 5);
    expect([...d.values()]).toEqual([-6, -4, 10, 0]);
  });
  it("respects a custom blank penalty", () => {
    const d = roundDeltas(results([5, 0, 0, 0]), "D", 3);
    expect([...d.values()]).toEqual([-5, 3, 3, 3]);
  });
});

describe("applyDeltas", () => {
  const scores = new Map([[0, 3], [1, 10], [2, 2], [3, 1]]);
  it("clamps overshoot to 0 and declares the winner", () => {
    const r = applyDeltas(scores, new Map([[0, -5], [1, -1]]), [1, 2, 3, 0]);
    expect(r.scores.get(0)).toBe(0);
    expect(r.scores.get(1)).toBe(9);
    expect(r.winner).toBe(0);
  });
  it("no winner when nobody hits 0", () => {
    expect(applyDeltas(scores, new Map([[0, -2]]), [1, 2, 3, 0]).winner).toBeUndefined();
  });
  it("lowest pre-clamp score wins a double finish; ties go to play order", () => {
    // seat 2: 2-3 = -1, seat 3: 1-3 = -2 → seat 3
    expect(applyDeltas(scores, new Map([[2, -3], [3, -3]]), [1, 2, 3, 0]).winner).toBe(3);
    // seat 2: 2-2 = 0, seat 3: 1-1 = 0 → tie → earlier in play order (seat 2)
    expect(applyDeltas(scores, new Map([[2, -2], [3, -1]]), [1, 2, 3, 0]).winner).toBe(2);
    expect(applyDeltas(scores, new Map([[2, -2], [3, -1]]), [3, 0, 1, 2]).winner).toBe(3);
  });
});

describe("hearts in the dark", () => {
  it("counts fourfold in both directions", () => {
    const results = [
      { seat: 0, participated: true, tricksWon: 3 },
      { seat: 1, participated: true, tricksWon: 0 },
      { seat: 2, participated: false, tricksWon: 0 },
    ];
    expect(scoreMultiplier("H")).toBe(2);
    expect(scoreMultiplier("H", true)).toBe(4);
    expect(scoreMultiplier("S", true)).toBe(1);
    const dark = roundDeltas(results, "H", 5, true);
    expect(dark.get(0)).toBe(-12);
    expect(dark.get(1)).toBe(20);
    expect(dark.get(2)).toBe(0);
    const plain = roundDeltas(results, "H", 5);
    expect(plain.get(0)).toBe(-6);
    expect(plain.get(1)).toBe(10);
  });
});
