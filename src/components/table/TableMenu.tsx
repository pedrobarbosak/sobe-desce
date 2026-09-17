import { useTranslation } from "react-i18next";
import { LuChartNoAxesColumn, LuDoorOpen, LuHistory, LuMusic, LuOctagon, LuUsers, LuVolume2, LuVolumeX, LuZap } from "react-icons/lu";
import { useSoundSettings } from "@/hooks/useSound";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import type { DrawerName } from "./TableBar";

type Props = {
  gameName: string;
  roundIndex: number | null;
  cap: number | null;
  /** Null when the viewer has no hand to play for them. */
  autoPlay: boolean | null;
  onAutoPlay: (on: boolean) => void;
  busy: boolean;
  canEndSitting: boolean;
  onEndSitting: () => void;
  canAbandon: boolean;
  isCampaign: boolean;
  onAbandon: () => void;
  onOpen: (drawer: DrawerName) => void;
};

const row = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-cream-50 hover:bg-white/10 disabled:opacity-50";

/**
 * Everything the bar has no room for on a phone on its side: the other views of the
 * game, the toggles, and the ways out. One tap away, in a sheet.
 */
export function TableMenu({ gameName, roundIndex, cap, autoPlay, onAutoPlay, busy, canEndSitting, onEndSitting, canAbandon, isCampaign, onAbandon, onOpen }: Props) {
  const { t } = useTranslation();
  const sound = useSoundSettings();
  const onOff = (on: boolean) => <span className={`ml-auto text-xs ${on ? "text-gold-400" : "text-cream-100/50"}`}>{on ? t("common.on") : t("common.off")}</span>;
  return (
    <div className="mx-auto max-w-md space-y-3">
      <p className="px-3 text-xs text-cream-100/70">
        <span className="font-display text-base font-bold text-cream-50">{gameName}</span>
        {roundIndex !== null && <> · {t("table.round", { n: roundIndex + 1 })}</>}
        {cap !== null && <> · {t("table.cap", { cap })}</>}
      </p>
      <div className="rounded-xl bg-black/25 p-1">
        <button type="button" className={row} onClick={() => onOpen("lobby")}>
          <LuUsers className="icon" /> {t("tabs.lobby")}
        </button>
        <button type="button" className={row} onClick={() => onOpen("standings")}>
          <LuChartNoAxesColumn className="icon" /> {t("tabs.standings")}
        </button>
        <button type="button" className={row} onClick={() => onOpen("history")}>
          <LuHistory className="icon" /> {t("tabs.history")}
        </button>
      </div>
      <div className="rounded-xl bg-black/25 p-1">
        {autoPlay !== null && (
          <button type="button" className={row} onClick={() => onAutoPlay(!autoPlay)} aria-pressed={autoPlay} title={t("table.autoPlayHint")}>
            <LuZap className="icon" /> {t("table.autoPlay")} {onOff(autoPlay)}
          </button>
        )}
        <button type="button" className={row} onClick={() => sound.setSfx(!sound.sfx)} aria-pressed={sound.sfx}>
          {sound.sfx ? <LuVolume2 className="icon" /> : <LuVolumeX className="icon" />} {t("table.sfx")} {onOff(sound.sfx)}
        </button>
        <button type="button" className={row} onClick={() => sound.setMusic(!sound.music)} aria-pressed={sound.music}>
          <LuMusic className="icon" /> {t("table.music")} {onOff(sound.music)}
        </button>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-sm font-semibold text-cream-50">{t("common.language")}</span>
          <LanguageToggle />
        </div>
      </div>
      {(canEndSitting || canAbandon) && (
        <div className="rounded-xl bg-black/25 p-1">
          {canEndSitting && (
            <button type="button" className={`${row} text-gold-400`} disabled={busy} onClick={onEndSitting}>
              <LuOctagon className="icon" /> {t("table.endSession")}
            </button>
          )}
          {canAbandon && (
            <button type="button" className={`${row} text-heart`} disabled={busy} onClick={onAbandon}>
              <LuDoorOpen className="icon" /> {t(isCampaign ? "table.abandonCampaign" : "table.abandon")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
