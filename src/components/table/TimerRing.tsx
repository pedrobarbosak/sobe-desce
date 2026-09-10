import { useEffect, useState } from "react";

/**
 * Circular countdown driven by an absolute deadline. The drain is a single CSS transition
 * on stroke-dashoffset, so there is no per-frame JavaScript or React work.
 */
export function TimerRing({ deadline, totalMs, size = 56, skewMs = 0 }: { deadline: number; totalMs: number; size?: number; skewMs?: number }) {
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const [phase, setPhase] = useState<{ remaining: number; started: boolean; urgent: boolean }>(() => ({
    remaining: Math.max(0, deadline - (Date.now() + skewMs)),
    started: false,
    urgent: false,
  }));

  useEffect(() => {
    const remaining = Math.max(0, deadline - (Date.now() + skewMs));
    setPhase({ remaining, started: false, urgent: remaining < 8000 });
    // Next frame: flip to the end state so the transition runs for `remaining` ms.
    const raf = requestAnimationFrame(() => setPhase((p) => ({ ...p, started: true })));
    const urgentAt = remaining - 8000;
    const t = urgentAt > 0 ? setTimeout(() => setPhase((p) => ({ ...p, urgent: true })), urgentAt) : null;
    return () => {
      cancelAnimationFrame(raf);
      if (t) clearTimeout(t);
    };
  }, [deadline, skewMs]);

  const startFrac = Math.max(0, Math.min(1, phase.remaining / totalMs));
  return (
    <svg width={size} height={size} className="absolute inset-0 -rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={phase.urgent ? "#e2432f" : "#e8b84a"}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={phase.started ? c : c * (1 - startFrac)}
        style={{ transition: phase.started ? `stroke-dashoffset ${phase.remaining}ms linear, stroke 300ms` : "none" }}
      />
    </svg>
  );
}
