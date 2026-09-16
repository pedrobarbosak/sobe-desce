import { Link, Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { Avatar } from "@/components/ui/Avatar";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { InstallAppBanner } from "@/components/ui/InstallApp";

export const Route = createRootRoute({ component: RootLayout });

function RootLayout() {
  const { t } = useTranslation();
  const { isLoading } = useAuthBootstrap();
  return (
    <div className="felt flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-40 border-b border-white/10 bg-felt-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3">
          <Link to="/" className="whitespace-nowrap font-display text-lg font-extrabold tracking-tight text-cream-50 sm:text-xl">
            <span className="text-gold-400">♠</span> {t("app.name")}
          </Link>
          <nav className="flex min-w-0 items-center gap-3 text-sm">
            <Link to="/rules" className="hidden text-cream-100/80 hover:text-cream-50 sm:inline">
              {t("nav.rules")}
            </Link>
            <LanguageToggle />
            {!isLoading && <MeChip />}
          </nav>
        </div>
        {!isLoading && <OngoingBar />}
      </header>
      <main className="safe-bottom mx-auto w-full max-w-7xl flex-1 px-3 py-3 sm:px-4 sm:py-5">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <InstallAppBanner />
            <Outlet />
          </>
        )}
      </main>
    </div>
  );
}

/**
 * A live sitting is easy to wander away from, so it follows the player around the app
 * until they go back to it.
 */
function OngoingBar() {
  const { t } = useTranslation();
  const ongoing = useQuery(api.games.ongoing);
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!ongoing) return null;
  if (path === `/g/${ongoing.gameId}/table`) return null;
  return (
    <Link
      to="/g/$gameId/table"
      params={{ gameId: ongoing.gameId }}
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-semibold transition ${
        ongoing.isMyTurn ? "bg-gold-400 text-ink-900 hover:bg-gold-300" : "bg-gold-400/15 text-gold-400 hover:bg-gold-400/25"
      }`}
    >
      <span className={ongoing.isMyTurn ? "turn-pulse" : ""}>
        {ongoing.isMyTurn ? t("nav.ongoingTurn") : t("nav.ongoing")}
      </span>
      <span className="truncate opacity-80">{ongoing.name}</span>
      <span className="rounded-full bg-black/20 px-2 py-0.5 text-xs">{t("nav.resume")}</span>
    </Link>
  );
}

function MeChip() {
  const me = useQuery(api.users.me);
  if (!me) return null;
  return (
    <Link
      to="/account"
      className="flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/20 py-1 pl-1 pr-3 text-cream-50 hover:bg-black/30"
    >
      <Avatar seed={me.avatarSeed} size={28} className="shrink-0" />
      {/* A phone has room for a first name, not the whole generated one. */}
      <span className="max-w-[5.5rem] truncate text-sm font-medium sm:max-w-[10rem]">{me.displayName}</span>
    </Link>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-cream-100/70">
      <span className="h-3 w-3 animate-bounce rounded-full bg-gold-400" />
      <span className="h-3 w-3 animate-bounce rounded-full bg-gold-400 [animation-delay:120ms]" />
      <span className="h-3 w-3 animate-bounce rounded-full bg-gold-400 [animation-delay:240ms]" />
      <span className="ml-2 text-sm">{label ?? t("common.loading")}</span>
    </div>
  );
}
