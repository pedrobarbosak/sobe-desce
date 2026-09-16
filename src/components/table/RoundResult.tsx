import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { LuDices, LuShield, LuShuffle, LuSwords, LuUsers } from "react-icons/lu";
import { SUIT_SYMBOLS, type Suit } from "@/engine";
import { Button } from "@/components/ui/Button";
import { POWERUP_ICONS, type PartyView, type Translate, twistName } from "./party";
import type { SeatView } from "./Seat";

/** Short status update for the round that just ended; the full matrix lives in Standings. */
export function RoundResult({
  seats,
  trump,
  dark = false,
  party = null,
  winnerName,
  gameOver,
  onBack,
  isOwner,
  hasRematch,
  onRematch,
  busy,
}: {
  seats: SeatView[];
  trump: Suit | null;
  dark?: boolean;
  party?: PartyView | null;
  winnerName: string | null;
  gameOver: boolean;
  onBack: () => void;
  isOwner: boolean;
  hasRematch: boolean;
  onRematch: () => void;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const ordered = [...seats].sort((a, b) => (a.scoreAfter ?? a.score) - (b.scoreAfter ?? b.score));
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="mx-auto w-full max-w-md rounded-2xl border border-gold-400/50 bg-black/75 p-5 text-center shadow-2xl"
    >
      <p className="text-xs uppercase tracking-widest text-gold-400">{gameOver ? t("table.gameOver") : t("table.roundOver")}</p>
      {gameOver && winnerName && <p className="mt-1 font-display text-2xl font-bold text-cream-50">{t("table.winner", { name: winnerName })}</p>}
      {trump && (
        <p className="mt-1 text-sm text-cream-100/70">
          {t("table.trump")}: <span className={trump === "H" || trump === "D" ? "text-heart" : "text-cream-50"}>{SUIT_SYMBOLS[trump]}</span> {t(`suits.${trump}`)}
          {trump === "H" && <span className="ml-1 rounded bg-heart px-1 text-[10px] font-bold text-white">{dark ? "×4" : "×2"}</span>}
          {party && party.twist === "golden" && party.goldenSuit === trump && (
            <span className="ml-1 rounded bg-gold-400 px-1 text-[10px] font-bold text-ink-900">{t("party.golden")}</span>
          )}
        </p>
      )}
      {party && (
        <p className="mt-1 text-xs text-purple-200">
          <LuDices className="icon" /> {twistName(party, t as unknown as Translate)}
        </p>
      )}
      {party?.swapped !== null && party?.swapped !== undefined && (
        <p className="mt-1 text-xs text-cream-100/80">
          <LuShuffle className="icon" /> {party.swapped ? t("party.swapped") : t("party.notSwapped")}
        </p>
      )}
      {party?.teams && (
        <ul className="mt-2 space-y-0.5 text-xs text-cream-100/80">
          {party.teams.map((partner, seat) =>
            seat < partner ? (
              <li key={seat} className={seats[seat]?.isMe || seats[partner]?.isMe ? "font-semibold text-gold-400" : ""}>
                <LuUsers className="icon" />{" "}
                {t("party.teamed", { a: seats[seat]?.isMe ? t("common.you") : seats[seat]?.name ?? "?", b: seats[partner]?.isMe ? t("common.you") : seats[partner]?.name ?? "?" })}
              </li>
            ) : null,
          )}
        </ul>
      )}
      {party?.nemeses && (
        <ul className="mt-2 space-y-0.5 text-xs text-cream-100/80">
          {party.nemeses.map((target, seat) => (
            <li key={seat} className={seats[seat]?.isMe ? "font-semibold text-gold-400" : ""}>
              <LuSwords className="icon" />{" "}
              {t("party.nemesisOf", { name: seats[seat]?.isMe ? t("common.you") : seats[seat]?.name ?? "?", target: seats[target]?.isMe ? t("common.you") : seats[target]?.name ?? "?" })}
            </li>
          ))}
        </ul>
      )}
      {party?.guardians && (
        <ul className="mt-2 space-y-0.5 text-xs text-cream-100/80">
          {party.guardians.map((ward, seat) => (
            <li key={seat} className={seats[seat]?.isMe ? "font-semibold text-gold-400" : ""}>
              <LuShield className="icon" /> {t("party.guarded", { name: seats[seat]?.isMe ? t("common.you") : seats[seat]?.name ?? "?", ward: seats[ward]?.isMe ? t("common.you") : seats[ward]?.name ?? "?" })}
            </li>
          ))}
        </ul>
      )}
      {party && party.awards.length > 0 && !gameOver && (
        <ul className="mt-2 space-y-0.5 text-xs text-cream-100/80">
          {party.awards.map((a, i) => {
            const who = seats[a.seat];
            const powerup = t(`party.powerups.${a.powerup}.name`);
            const Icon = POWERUP_ICONS[a.powerup];
            return (
              <li key={i} className={who?.isMe ? "font-semibold text-gold-400" : ""}>
                <Icon className="icon" /> {who?.isMe ? t("party.youDrew", { powerup }) : t("party.drew", { name: who?.name ?? "?", powerup })}
              </li>
            );
          })}
        </ul>
      )}
      {/* At the end of the game the classification below says this and more. */}
      {!gameOver && (
        <ul className="mt-3 divide-y divide-white/10">
          {ordered.map((s) => (
            <li key={s.seat} className="flex items-center gap-3 py-2 text-sm">
              <span className={`flex-1 truncate text-left ${s.isMe ? "font-semibold text-gold-400" : "text-cream-50"}`}>{s.isMe ? t("common.you") : s.name}</span>
              <span className="text-cream-100/60">
                {s.decision === "out" ? "–" : `${s.tricksWon} ${t("table.tricks")}${s.tricksWon === 0 ? ` · ${t("table.blank")}` : ""}`}
              </span>
              <span className={`w-10 text-right font-bold ${s.decision === "out" ? "text-cream-100/35" : (s.delta ?? 0) < 0 ? "text-emerald-300" : (s.delta ?? 0) > 0 ? "text-heart" : "text-cream-100/50"}`}>
                {s.decision === "out" ? "–" : s.delta === undefined ? "" : s.delta > 0 ? `+${s.delta}` : s.delta}
              </span>
              <span className="w-10 text-right font-mono text-base font-bold text-cream-50">{s.scoreAfter ?? s.score}</span>
            </li>
          ))}
        </ul>
      )}
      {gameOver ? (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {(isOwner || hasRematch) && (
            <Button disabled={busy} onClick={onRematch}>
              {hasRematch ? t("table.joinRematch") : t("table.playAgain")}
            </Button>
          )}
          <Button variant="ghost" onClick={onBack}>
            {t("table.backToLobby")}
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-xs text-cream-100/60">{t("table.nextRoundSoon")}</p>
      )}
    </motion.div>
  );
}
