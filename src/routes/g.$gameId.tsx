import { Link, Outlet, createFileRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { variantOf } from "@/engine";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { usePresence } from "@/hooks/usePresence";
import { Panel } from "@/components/ui/Panel";
import { Crumbs } from "@/components/ui/Crumbs";
import { Loading } from "./__root";

export const Route = createFileRoute("/g/$gameId")({ component: GameLayout });

function GameLayout() {
  const { t } = useTranslation();
  const { gameId } = Route.useParams();
  const data = useQuery(api.games.get, { gameId: gameId as Id<"games"> });
  usePresence(data ? data.game._id : undefined);
  const onTable = useRouterState({ select: (s) => s.location.pathname.endsWith("/table") });

  if (data === undefined) return <Loading />;
  if (data === null) {
    return (
      <Panel className="mx-auto max-w-md text-center">
        <p>{t("errors.notFound")}</p>
      </Panel>
    );
  }
  const { game } = data;
  const tabCls =
    "rounded-lg px-2.5 py-1 text-xs font-semibold text-cream-100/70 hover:bg-white/10 sm:px-3 sm:py-1.5 sm:text-sm [&.active]:bg-cream-100 [&.active]:text-ink-900";
  return (
    <div className={onTable ? "space-y-2" : "space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className={onTable ? "flex items-baseline gap-3" : "space-y-1"}>
          {!onTable && <Crumbs trail={[{ label: game.name }]} />}
          <h1 className={`font-display font-extrabold text-cream-50 ${onTable ? "text-lg" : "text-2xl sm:text-3xl"}`}>{game.name}</h1>
          <p className="text-sm text-cream-100/60">
            {t(`modes.${game.mode}`)}, {t(`presets.${game.config.preset}.name`)}, {game.config.deck} {t("new.cards")}
            {variantOf(game.config) === "party" && <span className="ml-2 rounded bg-purple-700/70 px-1.5 text-[10px] font-semibold text-white">🎲 {t("variants.party")}</span>}
          </p>
        </div>
        {/* Standings and history are empty until a card has been dealt. */}
        {game.status !== "lobby" && (
        <nav className="flex gap-1 rounded-xl border border-white/10 bg-black/20 p-1">
          <Link to="/g/$gameId" params={{ gameId }} activeOptions={{ exact: true }} className={tabCls}>
            {t("tabs.lobby")}
          </Link>
          <Link to="/g/$gameId/standings" params={{ gameId }} className={tabCls}>
            {t("tabs.standings")}
          </Link>
          <Link to="/g/$gameId/history" params={{ gameId }} className={tabCls}>
            {t("tabs.history")}
          </Link>
        </nav>
        )}
      </div>
      <Outlet />
    </div>
  );
}
