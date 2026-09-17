import { describe, expect, it } from "vitest";
import { feltLayout } from "@/hooks/useFeltLayout";
import { ringPlacer } from "@/components/table/geometry";

const at = (w: number, h: number, extra: Partial<Parameters<typeof feltLayout>[0]> = {}) =>
  feltLayout({ felt: { w, h }, statusBelow: false, hasOpenHands: false, hasFaceUp: false, ...extra });

/** A phone on its side: the felt is the screen minus the 44px bar. */
const PHONES: [number, number][] = [
  [740, 316],
  [640, 256],
  [915, 368],
];

describe("felt layout on a phone on its side", () => {
  it("is the short tier under 400px, and only there", () => {
    for (const [w, h] of PHONES) expect(at(w, h).short).toBe(true);
    expect(at(800, 500).short).toBe(false);
    expect(at(1280, 720).short).toBe(false);
  });

  it("fits the ring, the status row and the hand within the felt", () => {
    for (const [w, h] of PHONES) {
      const l = at(w, h);
      const { topPad, bottomPad, usable } = l.budget;
      expect(topPad + usable + bottomPad).toBeLessThanOrEqual(h);
      // The top seat clears the top edge, and the bottom of the ring clears the hand.
      const top = (l.ellipse.cy - l.ellipse.ry) / 100;
      expect(top * h - l.budget.seatHalf).toBeGreaterThanOrEqual(0);
      const ringBottom = ((l.ellipse.cy + l.ellipse.ry) / 100) * h;
      expect(ringBottom).toBeLessThanOrEqual(h - l.handReserve);
    }
  });

  it("keeps the side seats' labels inside the felt", () => {
    for (const [w, h] of PHONES) {
      const l = at(w, h);
      const placer = ringPlacer([0, 1, 2, 3, 4, 5], 0, l.ellipse, l.trickSpread);
      for (const seat of [1, 2, 3, 4, 5]) {
        const x = (placer.seat(seat).x / 100) * w;
        // Half a 7.5rem label at most.
        expect(x - 60).toBeGreaterThanOrEqual(-4);
        expect(x + 60).toBeLessThanOrEqual(w + 4);
      }
    }
  });

  it("keeps played cards out of the hand", () => {
    for (const [w, h] of PHONES) {
      const l = at(w, h);
      const placer = ringPlacer([0, 1, 2, 3, 4], 0, l.ellipse, l.trickSpread);
      const cardH = Math.round(l.cardWidth * 0.72) * 1.42;
      for (const seat of [0, 1, 2, 3, 4]) {
        const y = (placer.slot(seat).y / 100) * h;
        expect(y + cardH / 2).toBeLessThanOrEqual(h - l.handReserve + 2);
      }
    }
  });

  it("lays a crowded trick out in a row, one slot per seat, left to right", () => {
    const l = at(740, 316);
    const seats = [0, 1, 2, 3, 4, 5, 6, 7];
    const placer = ringPlacer(seats, 0, l.ellipse, { ...l.trickSpread, row: true });
    const xs = seats.map((s) => placer.slot(s).x).sort((a, b) => a - b);
    const cardW = (Math.round(l.cardWidth * 0.6) / 740) * 100;
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThanOrEqual(cardW * 0.8);
    // Inside the ring, clear of the side seats' labels.
    expect(xs[0]).toBeGreaterThan(l.ellipse.cx - l.ellipse.rx + 8);
    expect(xs[xs.length - 1]).toBeLessThan(l.ellipse.cx + l.ellipse.rx - 8);
    // The seat on the left of the felt gets the leftmost card.
    const leftSeat = seats.reduce((best, s) => (placer.seat(s).x < placer.seat(best).x ? s : best), 0);
    expect(placer.slot(leftSeat).x).toBe(xs[0]);
  });

  it("still scales below the old floors", () => {
    expect(at(640, 256).cardWidth).toBeLessThan(at(740, 316).cardWidth);
    expect(at(640, 256).avatarSize).toBeLessThan(36);
    expect(at(640, 256).cardWidth).toBeGreaterThanOrEqual(48);
  });

  it("leaves taller felts exactly as they were", () => {
    const l = at(1200, 700);
    expect(l.cardWidth).toBe(146);
    expect(l.avatarSize).toBe(64);
    expect(l.trickSpread).toEqual({ x: 0.36, y: 0.4 });
    expect(l.panelStyle).toEqual({ top: `${l.ellipse.cy}%`, transform: "translateY(-50%)" });
  });
});
