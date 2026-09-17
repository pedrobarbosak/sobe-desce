/** Seat placement around an ellipse. The viewer always sits at the bottom (6 o'clock). */
export type Ellipse = { cx: number; cy: number; rx: number; ry: number };
/** How far out from the centre played cards land, as fractions of the ellipse's radii. */
export type TrickSpread = { x: number; y: number };

export const DEFAULT_ELLIPSE: Ellipse = { cx: 50, cy: 47, rx: 43, ry: 38 };
export const DEFAULT_SPREAD: TrickSpread = { x: 0.36, y: 0.4 };

export function seatAngle(rel: number, n: number): number {
  return Math.PI / 2 + (rel * 2 * Math.PI) / n;
}

export function seatPosition(rel: number, n: number, e: Ellipse = DEFAULT_ELLIPSE) {
  const a = seatAngle(rel, n);
  return { x: e.cx + e.rx * Math.cos(a), y: e.cy + e.ry * Math.sin(a), angle: a };
}

/** Where a played card lands: between the centre and the seat. */
export function trickSlot(rel: number, n: number, e: Ellipse = DEFAULT_ELLIPSE, spread: TrickSpread = DEFAULT_SPREAD) {
  const a = seatAngle(rel, n);
  return {
    x: e.cx + e.rx * spread.x * Math.cos(a),
    y: e.cy + e.ry * spread.y * Math.sin(a),
    rotate: ((a - Math.PI / 2) * 180) / Math.PI,
  };
}

/**
 * Which seats occupy the ring and in what order. Once the tricks start, players who sat
 * out leave the ring so the rest spread out evenly. Returns the ordered seat list.
 */
export function ringLayout(seatCount: number, inRing: (seat: number) => boolean): number[] {
  const out: number[] = [];
  for (let s = 0; s < seatCount; s++) if (inRing(s)) out.push(s);
  return out;
}

/**
 * Position lookup for a seat within a ring layout. The viewer anchors the bottom. When the
 * viewer is not in the ring (they sat out, or are only watching) the ring turns half a
 * step: with an even number of seats that keeps anyone off the 6 o'clock spot, which
 * belongs to the viewer. (An odd ring still puts someone at 12 o'clock, which is why the
 * table moves its status card to the bottom for these viewers.)
 */
export function ringPlacer(layout: number[], mySeat: number, e: Ellipse = DEFAULT_ELLIPSE, spread: TrickSpread = DEFAULT_SPREAD) {
  const n = Math.max(1, layout.length);
  const myIdx = layout.indexOf(mySeat);
  const anchorIdx = Math.max(0, myIdx);
  const offset = myIdx < 0 ? 0.5 : 0;
  const rel = (seat: number) => {
    const idx = layout.indexOf(seat);
    return (((idx < 0 ? 0 : idx) - anchorIdx + n) % n) + offset;
  };
  return {
    n,
    rel,
    seat: (seat: number) => seatPosition(rel(seat), n, e),
    slot: (seat: number) => trickSlot(rel(seat), n, e, spread),
  };
}
