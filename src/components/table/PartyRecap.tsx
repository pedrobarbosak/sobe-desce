import { useTranslation } from "react-i18next";
import { LuArrowLeftRight, LuHandCoins, LuShield, LuShuffle, LuSwords, LuUsers } from "react-icons/lu";
import { PARTY_TWIST_ICONS } from "./partyIcons";
import { type Translate, type TwistFacts, twistName } from "./party";

/** What a round's twist was and what it revealed: enough for the result card and the record. */
export type RecapParty = TwistFacts & {
  swapped?: boolean | null;
  robinSwap?: number[] | null;
  teams?: number[] | null;
  nemeses?: number[] | null;
  guardians?: number[] | null;
  raids?: { seat: number; target: number }[] | null;
};

type Named = { name: string; isMe?: boolean };

/**
 * The round's twist and the reveals that came with it, by seat: who was paired with whom,
 * who was after whom, whether the hands moved, who traded results. Shown on the round
 * result as it happens and in the history afterwards.
 */
export function PartyRecap({ party, seats, compact = false }: { party: RecapParty; seats: (Named | undefined)[]; compact?: boolean }) {
  const { t } = useTranslation();
  const tr = t as unknown as Translate;
  const who = (seat: number) => (seats[seat]?.isMe ? t("common.you") : seats[seat]?.name ?? "?");
  const tone = (...involved: number[]) => (involved.some((s) => seats[s]?.isMe) ? "font-semibold text-gold-400" : "text-cream-100/80");
  const Icon = PARTY_TWIST_ICONS[party.twist];
  return (
    <div className={`space-y-0.5 ${compact ? "text-[11px]" : "text-xs"}`}>
      <p className="text-purple-200">
        <Icon className="icon" /> {twistName(party, tr)}
      </p>
      {party.swapped !== null && party.swapped !== undefined && (
        <p className="text-cream-100/80">
          <LuShuffle className="icon" /> {party.swapped ? t("party.swapped") : t("party.notSwapped")}
        </p>
      )}
      {party.robinSwap && party.robinSwap.length === 2 && (
        <p className={tone(party.robinSwap[0]!, party.robinSwap[1]!)}>
          <LuArrowLeftRight className="icon" /> {t("party.robinSwapped", { a: who(party.robinSwap[0]!), b: who(party.robinSwap[1]!) })}
        </p>
      )}
      {party.teams?.map((partner, seat) =>
        seat < partner ? (
          <p key={seat} className={tone(seat, partner)}>
            <LuUsers className="icon" /> {t("party.teamed", { a: who(seat), b: who(partner) })}
          </p>
        ) : null,
      )}
      {party.nemeses?.map((target, seat) => (
        <p key={seat} className={tone(seat)}>
          <LuSwords className="icon" /> {t("party.nemesisOf", { name: who(seat), target: who(target) })}
        </p>
      ))}
      {party.raids?.map((raid, i) => (
        <p key={i} className={tone(raid.seat, raid.target)}>
          <LuHandCoins className="icon" /> {t("party.raided", { name: who(raid.seat), target: who(raid.target) })}
        </p>
      ))}
      {party.guardians?.map((ward, seat) => (
        <p key={seat} className={tone(seat)}>
          <LuShield className="icon" /> {t("party.guarded", { name: who(seat), ward: who(ward) })}
        </p>
      ))}
    </div>
  );
}
