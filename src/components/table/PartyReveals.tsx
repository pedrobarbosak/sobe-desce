import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import type { IconType } from "react-icons";
import { LuDices, LuHand, LuShuffle } from "react-icons/lu";
import { PARTY_TWIST_ICONS } from "./partyIcons";
import { type PartyView, type Translate, twistName, twistVars } from "./party";

/** The round's twist, kept in the corner of the felt for the whole round. */
export function TwistBanner({ party, compact = false }: { party: PartyView; compact?: boolean }) {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const Icon = PARTY_TWIST_ICONS[party.twist];
  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      className={`rounded-xl border border-purple-400/50 bg-purple-950/70 text-cream-50 shadow-lg backdrop-blur ${compact ? "px-2.5 py-1.5" : "px-3 py-2"}`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wider text-purple-200/80">
        <LuDices className="icon" /> {t("party.twistOfRound")}
      </p>
      <p className={`font-display font-bold ${compact ? "text-sm" : "text-base"}`}>
        <span className="mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-purple-400/30 px-1 text-xs">
          <Icon className="icon" />
        </span>
        {twistName(party, tr)}
      </p>
      {!compact && <p className="max-w-[16rem] text-xs text-cream-100/75">{tr(`party.twists.${party.twist}.desc`, twistVars(party, tr))}</p>}
    </motion.div>
  );
}

/** The round's twist, announced in the middle of the felt the moment the round is dealt. */
export function TwistReveal({ party, compact = false }: { party: PartyView; compact?: boolean }) {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const Icon = PARTY_TWIST_ICONS[party.twist];
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0, rotate: -8 }}
      animate={{ scale: [0.3, 1.12, 1], opacity: [0, 1, 1], rotate: [-8, 2, 0] }}
      exit={{ scale: 0.6, opacity: 0 }}
      transition={{ duration: 0.7, times: [0, 0.6, 1] }}
      className={`pointer-events-none flex flex-col items-center rounded-3xl border border-purple-400/60 bg-black/70 text-center shadow-2xl ${
        compact ? "max-w-[20rem] px-5 py-4" : "max-w-md px-8 py-5"
      }`}
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-purple-200/80">
        <LuDices className="icon" /> {t("party.twistOfRound")}
      </p>
      <motion.span
        className={`mt-2 flex text-purple-200 drop-shadow-[0_0_24px_rgba(168,85,247,0.7)] ${compact ? "text-[4rem]" : "text-[5.5rem]"}`}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ repeat: Infinity, duration: 1.2 }}
      >
        <Icon className="icon" strokeWidth={1.5} />
      </motion.span>
      <p className={`mt-1 font-display font-extrabold text-cream-50 ${compact ? "text-2xl" : "text-3xl"}`}>{twistName(party, tr)}</p>
      <p className={`mt-1 text-cream-100/80 ${compact ? "text-xs" : "text-sm"}`}>{tr(`party.twists.${party.twist}.desc`, twistVars(party, tr))}</p>
    </motion.div>
  );
}

function CoinFace({ icon: Icon, label, size, back = false }: { icon: IconType; label: string; size: number; back?: boolean }) {
  return (
    <div
      className="backface-hidden absolute inset-0 flex flex-col items-center justify-center rounded-full text-ink-900"
      style={{
        transform: back ? "rotateY(180deg)" : undefined,
        border: `${Math.round(size * 0.05)}px solid var(--color-brass-600)`,
        background: "radial-gradient(circle at 35% 30%, #fff3c4 0%, var(--color-gold-400) 45%, var(--color-gold-600) 100%)",
        boxShadow: "inset 0 0 0 2px rgb(255 243 196 / 0.6), inset 0 0 24px rgb(125 90 23 / 0.35), 0 12px 30px rgb(0 0 0 / 0.45)",
      }}
    >
      <Icon style={{ width: size * 0.36, height: size * 0.36 }} strokeWidth={2.25} />
      <span className="mt-1 font-display font-extrabold uppercase" style={{ fontSize: Math.max(11, size * 0.11), letterSpacing: "0.2em" }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Party "swap": the coin that decides whether the hands move, tossed in the middle of the
 * felt. Heads (the hands move) is the front face; the coin spins a few full turns and
 * settles on whichever side actually came up, then the verdict is written out below it.
 */
export function CoinFlip({ swapped, compact = false }: { swapped: boolean; compact?: boolean }) {
  const { t } = useTranslation();
  const size = compact ? 110 : 160;
  const spins = 5;
  const landed = 360 * spins + (swapped ? 0 : 180);
  const flightMs = 1900;
  return (
    <motion.div
      className="pointer-events-none flex flex-col items-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.25 }}
    >
      <p className="text-[11px] uppercase tracking-[0.3em] text-cream-100/70">
        <LuShuffle className="icon" /> {t("party.twists.swap.name")} · {t("party.coinToss")}
      </p>
      <div className="mt-4" style={{ perspective: 900, width: size, height: size }}>
        <motion.div
          className="preserve-3d relative h-full w-full"
          initial={{ rotateY: 0, y: 0 }}
          animate={{ rotateY: landed, y: [0, -size * 0.9, 0, -size * 0.16, 0] }}
          transition={{
            rotateY: { duration: flightMs / 1000, ease: [0.25, 0.7, 0.3, 1] },
            y: { duration: flightMs / 1000, times: [0, 0.42, 0.8, 0.9, 1], ease: ["easeOut", "easeIn", "easeOut", "easeIn"] },
          }}
        >
          <CoinFace icon={LuShuffle} label={t("party.coinHeads")} size={size} />
          <CoinFace icon={LuHand} label={t("party.coinTails")} size={size} back />
        </motion.div>
      </div>
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: flightMs / 1000 + 0.05 }}
        className={`mt-4 rounded-full bg-black/65 px-4 py-1.5 font-display font-extrabold text-cream-50 shadow-xl backdrop-blur ${compact ? "text-lg" : "text-2xl"}`}
      >
        {swapped ? t("party.coinMoved") : t("party.coinStayed")}
      </motion.p>
    </motion.div>
  );
}
