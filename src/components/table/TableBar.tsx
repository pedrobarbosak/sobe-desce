import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LuArrowLeft, LuDices, LuMusic, LuRotateCcw, LuVolume2, LuVolumeX } from "react-icons/lu";
import { SUIT_SYMBOLS, type Suit } from "@/engine";
import { useSoundSettings } from "@/hooks/useSound";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { type PartyView, type Translate, twistName, twistVars } from "./party";

export type DrawerName = "lobby" | "standings" | "history";

type Props = {
  gameName: string;
  /** Zero-based; null between sittings. */
  roundIndex: number | null;
  /** The discard cap for this round, shown while a sitting is live. */
  cap: number | null;
  trump: Suit | null;
  /** The trump came off the stock rather than out of someone's head. */
  flipped: boolean;
  /** Hearts called blind: the round counts fourfold. */
  dark: boolean;
  /** Party "golden": the drawn suit became the trump, so the round counts double. */
  goldenTrump: boolean;
  party: PartyView | null;
  busy: boolean;
  /** Campaign: anyone seated, the host or the owner may call time on the sitting. */
  canEndSitting: boolean;
  onEndSitting: () => void;
  /** A seated human on an unfinished table may walk away. */
  canAbandon: boolean;
  isCampaign: boolean;
  onAbandon: () => void;
  onOpen: (drawer: DrawerName) => void;
};

/** The thin strip above the felt: where we are in the game, and the way out of it. */
export function TableBar({ gameName, roundIndex, cap, trump, flipped, dark, goldenTrump, party, busy, canEndSitting, onEndSitting, canAbandon, isCampaign, onAbandon, onOpen }: Props) {
  const { t } = useTranslation();
  // Twist names and descriptions are built from dynamic keys, which the typed `t` rejects.
  const tr = t as unknown as Translate;
  const soundSettings = useSoundSettings();
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-white/10 bg-black/40 px-2 text-xs text-cream-100/80 sm:gap-3 sm:px-3 sm:text-sm">
      <Link to="/" className="rounded-md px-2 py-1 font-semibold text-gold-400 hover:bg-white/10" aria-label={t("table.home")} title={t("table.home")}>
        ♠
      </Link>
      <button
        type="button"
        onClick={() => onOpen("lobby")}
        className="rounded-md px-2 py-1 font-semibold text-cream-50 hover:bg-white/10"
        aria-label={t("table.backToLobby")}
        title={t("table.backToLobby")}
      >
        <LuArrowLeft className="icon" />
      </button>
      <span className="hidden max-w-[14rem] truncate font-display font-bold text-cream-50 lg:inline">{gameName}</span>
      {roundIndex !== null && <span className="whitespace-nowrap font-semibold text-cream-50">{t("table.round", { n: roundIndex + 1 })}</span>}
      {cap !== null && <span className="hidden whitespace-nowrap lg:inline">{t("table.cap", { cap })}</span>}
      {trump ? (
        <span className={`flex items-center gap-1 rounded-md bg-cream-50 px-1.5 py-0.5 font-bold ${trump === "H" || trump === "D" ? "text-heart" : "text-ink-900"}`}>
          <span className="text-base leading-none">{SUIT_SYMBOLS[trump]}</span>
          <span className="hidden sm:inline">{t(`suits.${trump}`).split(" ")[0]}</span>
          {flipped && (
            <span className="rounded bg-ink-900 px-1 text-[10px] text-white" title={t("table.flippedCard")}>
              <LuRotateCcw className="icon" />
            </span>
          )}
          {trump === "H" && (
            <span className={`rounded px-1 text-[10px] font-bold text-white ${dark ? "bg-heart ring-1 ring-cream-50" : "bg-heart"}`}>
              {dark ? "×4" : "×2"}
            </span>
          )}
          {trump === "C" && <span className="rounded bg-ink-900 px-1 text-[10px] text-white">!</span>}
          {goldenTrump && <span className="rounded bg-gold-400 px-1 text-[10px] font-bold text-ink-900">×2</span>}
        </span>
      ) : (
        <span className="whitespace-nowrap text-cream-100/50">{t("table.noTrump")}</span>
      )}
      {party && (
        <span
          className="flex items-center gap-1 rounded-md border border-purple-400/50 bg-purple-900/60 px-1.5 py-0.5 font-semibold text-cream-50"
          title={tr(`party.twists.${party.twist}.desc`, twistVars(party, tr))}
        >
          <LuDices className="icon" />
          <span className="hidden sm:inline">{twistName(party, tr)}</span>
          {party.twist === "golden" && party.goldenSuit && (
            <span className={`rounded bg-cream-50 px-1 text-[11px] leading-none ${party.goldenSuit === "D" ? "text-heart" : "text-ink-900"}`}>{SUIT_SYMBOLS[party.goldenSuit]}</span>
          )}
        </span>
      )}
      <nav className="ml-auto flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => onOpen("lobby")} className="rounded-md px-2 py-1 hover:bg-white/10">
          {t("tabs.lobby")}
        </button>
        <button type="button" onClick={() => onOpen("standings")} className="rounded-md px-2 py-1 hover:bg-white/10">
          {t("tabs.standings")}
        </button>
        <button type="button" onClick={() => onOpen("history")} className="hidden rounded-md px-2 py-1 hover:bg-white/10 sm:inline">
          {t("tabs.history")}
        </button>
        {canEndSitting && (
          <button
            type="button"
            onClick={onEndSitting}
            disabled={busy}
            className="hidden rounded-md px-2 py-1 text-cream-100/70 hover:bg-white/10 hover:text-gold-400 lg:inline"
          >
            {t("table.endSession")}
          </button>
        )}
        {canAbandon && (
          <button
            type="button"
            onClick={onAbandon}
            disabled={busy}
            className="hidden rounded-md px-2 py-1 text-cream-100/60 hover:bg-white/10 hover:text-heart lg:inline"
          >
            {t(isCampaign ? "table.abandonCampaign" : "table.abandon")}
          </button>
        )}
        <button
          type="button"
          onClick={() => soundSettings.setSfx(!soundSettings.sfx)}
          aria-pressed={soundSettings.sfx}
          title={t("table.sfx")}
          className={`rounded-md px-2 py-1 hover:bg-white/10 ${soundSettings.sfx ? "text-cream-50" : "text-cream-100/40"}`}
        >
          {soundSettings.sfx ? <LuVolume2 className="icon" /> : <LuVolumeX className="icon" />}
        </button>
        <button
          type="button"
          onClick={() => soundSettings.setMusic(!soundSettings.music)}
          aria-pressed={soundSettings.music}
          title={t("table.music")}
          className={`rounded-md px-2 py-1 hover:bg-white/10 ${soundSettings.music ? "text-cream-50" : "text-cream-100/40"}`}
        >
          <LuMusic className="icon" />
        </button>
        {/* Off the bar on a phone: the language is a home-page setting, and the bar has no room. */}
        <div className="hidden sm:block">
          <LanguageToggle />
        </div>
      </nav>
    </div>
  );
}
