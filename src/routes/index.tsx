import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { LuDices } from "react-icons/lu";
import { api } from "../../convex/_generated/api";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";

export const Route = createFileRoute("/")({ component: Landing });

/** The game's signature ranking, A 7 K J Q, as the hero hand. */
const HERO_HAND = [
  { card: "A", suit: "♠", red: false },
  { card: "7", suit: "♥", red: true },
  { card: "K", suit: "♦", red: true },
  { card: "J", suit: "♣", red: false },
  { card: "Q", suit: "♠", red: false },
];

function HeroHand() {
  return (
    <div className="relative mx-auto h-56 w-[19rem] sm:h-64 sm:w-[22rem] short:hidden" aria-hidden>
      {HERO_HAND.map((c, i) => {
        const angle = (i - 2) * 11;
        return (
          <div
            key={c.card + c.suit}
            className="deal-in card-face absolute left-1/2 top-4 flex h-44 w-32 -translate-x-1/2 flex-col justify-between p-2 font-display font-extrabold sm:h-52 sm:w-36"
            style={{
              transformOrigin: "50% 130%",
              ["--r" as string]: `${angle}deg`,
              ["--delay" as string]: `${i * 0.12}s`,
              zIndex: i,
              color: c.red ? "#c2263a" : "#1c2b4a",
            }}
          >
            <span className="text-2xl leading-none">
              {c.card}
              <span className="block text-lg">{c.suit}</span>
            </span>
            <span className="self-center text-5xl leading-none">{c.suit}</span>
            <span className="self-end rotate-180 text-2xl leading-none">
              {c.card}
              <span className="block text-lg">{c.suit}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

type MyGame = NonNullable<ReturnType<typeof useQuery<typeof api.games.myGames>>>[number];

function GameCard({ game: g }: { game: MyGame }) {
  const { t } = useTranslation();
  return (
    <Link to="/g/$gameId" params={{ gameId: g.gameId }}>
      <Panel className="transition hover:-translate-y-0.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-cream-50">{g.name}</span>
          <span className="font-mono text-xs tracking-widest text-gold-400">{g.code}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-xs text-cream-100/70">
          <span>
            {t(`modes.${g.mode}`)}, {t(`status.${g.status}`)}
          </span>
          <span>
            {g.score} {t("common.points")}
          </span>
        </div>
      </Panel>
    </Link>
  );
}

function Landing() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [joinOpen, setJoinOpen] = useState(false);
  const codeInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (joinOpen) codeInput.current?.focus();
  }, [joinOpen]);
  const myGames = useQuery(api.games.myGames);
  const openTables = useQuery(api.games.openTables);
  const [showFinished, setShowFinished] = useState(false);
  // Finished games are kept for their standings, but they are not what people come back for.
  const liveGames = myGames?.filter((g) => g.status !== "finished") ?? [];
  const finishedGames = myGames?.filter((g) => g.status === "finished") ?? [];

  // A phone on its side: the hero and the games side by side, open tables below.
  return (
    <div className="space-y-10 short:grid short:grid-cols-[1fr_1.3fr] short:gap-x-6 short:gap-y-4 short:space-y-0">
      <section className="grid items-center gap-8 py-6 sm:py-10 lg:grid-cols-[1.2fr_1fr] lg:gap-4 short:block short:py-0">
        <div className="max-w-xl">
          <p className="font-display text-lg italic text-cream-100/80 short:hidden">{t("landing.kicker")}</p>
          <h1 className="mt-2 font-display text-6xl font-extrabold leading-[0.95] tracking-tight text-cream-50 sm:text-8xl short:mt-0 short:text-4xl">
            {t("landing.title")}
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-cream-100/85 sm:text-lg short:hidden">{t("landing.subtitle")}</p>
          <div className="mt-8 flex flex-wrap items-center gap-3 short:mt-4">
            <Link to="/new">
              <Button className="px-6 py-3 text-base">{t("landing.create")}</Button>
            </Link>
            {joinOpen ? (
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const clean = code.trim().toUpperCase();
                  if (clean) void navigate({ to: "/join/$code", params: { code: clean } });
                }}
              >
                <input
                  ref={codeInput}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setJoinOpen(false);
                  }}
                  placeholder={t("landing.joinPlaceholder")}
                  maxLength={8}
                  className="w-40 rounded-lg border border-brass-400/70 bg-black/30 px-4 py-3 text-center font-mono text-base tracking-[0.3em] text-cream-50 placeholder:tracking-normal placeholder:text-cream-100/40 focus:border-brass-400 focus:outline-none"
                  aria-label={t("landing.joinTitle")}
                />
                <Button type="submit" variant="secondary" className="py-3" disabled={code.trim().length < 4}>
                  {t("landing.joinButton")}
                </Button>
                <Button type="button" variant="ghost" className="py-3 text-cream-100" onClick={() => setJoinOpen(false)}>
                  {t("landing.joinCancel")}
                </Button>
              </form>
            ) : (
              <Button variant="ghost" className="px-6 py-3 text-base text-cream-100" onClick={() => setJoinOpen(true)}>
                {t("landing.joinReveal")}
              </Button>
            )}
          </div>
        </div>
        <HeroHand />
      </section>

      <section className="short:min-w-0">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 short:mb-2">
          <h2 className="font-display text-2xl font-bold text-cream-50 short:text-lg">{t("landing.myGames")}</h2>
          {finishedGames.length > 0 && (
            <button
              type="button"
              onClick={() => setShowFinished(!showFinished)}
              className="text-xs font-semibold text-cream-100/60 hover:text-cream-50"
              aria-expanded={showFinished}
            >
              {showFinished ? t("landing.hideFinished") : t("landing.showFinished", { count: finishedGames.length })}
            </button>
          )}
        </div>
        {myGames === undefined ? null : liveGames.length === 0 && !showFinished ? (
          <Panel className="text-sm text-cream-100/70">{t("landing.noMyGames")}</Panel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 short:grid-cols-1 short:gap-2">
            {liveGames.map((g) => (
              <GameCard key={g.gameId} game={g} />
            ))}
          </div>
        )}
        {showFinished && finishedGames.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cream-100/50">{t("landing.finishedGames")}</h3>
            <div className="grid gap-3 opacity-80 sm:grid-cols-2 lg:grid-cols-3 short:grid-cols-1 short:gap-2">
              {finishedGames.map((g) => (
                <GameCard key={g.gameId} game={g} />
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="short:col-span-2">
        <h2 className="mb-3 font-display text-2xl font-bold text-cream-50 short:mb-2 short:text-lg">{t("landing.openTables")}</h2>
        {openTables === undefined ? null : openTables.length === 0 ? (
          <Panel className="text-sm text-cream-100/70">{t("landing.noOpenTables")}</Panel>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 short:grid-cols-3">
            {openTables.map((g) => (
              <Panel key={g.gameId} className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-cream-50">{g.name}</span>
                  {g.variant === "party" && (
                    <span className="shrink-0 rounded bg-purple-700/70 px-1.5 text-[10px] font-semibold text-white">
                      <LuDices className="icon" /> {t("variants.party")}
                    </span>
                  )}
                  <span className="shrink-0 rounded bg-white/10 px-1.5 text-[10px] font-semibold text-cream-100/70">{t(`modes.${g.mode}`)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-cream-100/70">
                  <Avatar seed={g.hostAvatar} size={22} />
                  <span className="truncate">
                    {t("landing.host")}: {g.hostName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-cream-100/70">
                  <span>
                    {t(`presets.${g.preset}.name`)}, {g.deck} {t("new.cards")}, {g.startingPoints} {t("common.points")}
                  </span>
                  <span className="font-semibold text-gold-400">{t("landing.seatsFree", { count: g.playerCount, max: g.rosterSize })}</span>
                </div>
                <Link to="/join/$code" params={{ code: g.code }} className="mt-auto">
                  <Button variant="secondary" className="w-full">
                    {t("landing.joinTable")}
                  </Button>
                </Link>
              </Panel>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
