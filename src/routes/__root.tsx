import { useState } from "react";
import { Link, Outlet, createRootRoute, useRouterState } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { LuBookOpen, LuMenu, LuUser } from "react-icons/lu";
import { api } from "../../convex/_generated/api";
import { useAuthBootstrap } from "@/hooks/useAuthBootstrap";
import { Avatar } from "@/components/ui/Avatar";
import { Drawer } from "@/components/ui/Drawer";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { InstallAppBanner } from "@/components/ui/InstallApp";

export const Route = createRootRoute({ component: RootLayout });

/**
 * The frame round every page but the table. On a phone on its side the header is one
 * thin row: the wordmark, a chip for a live game, the avatar and a menu button; the
 * rules link, the language and the name wait in the menu.
 */
function RootLayout() {
  const { t } = useTranslation();
  const { isLoading } = useAuthBootstrap();
  const [menu, setMenu] = useState(false);
  return (
    <div className="felt safe-x flex min-h-full flex-col">
      <header className="safe-top sticky top-0 z-40 border-b border-white/10 bg-felt-900/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-3 py-2.5 sm:px-4 sm:py-3 short:py-1">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/" className="whitespace-nowrap font-display text-lg font-extrabold tracking-tight text-cream-50 sm:text-xl short:text-base">
              <span className="text-gold-400">♠</span> {t("app.name")}
            </Link>
            {!isLoading && <OngoingLink chip />}
          </div>
          <nav className="flex min-w-0 shrink-0 items-center gap-3 text-sm short:gap-1.5">
            <Link to="/rules" className="hidden text-cream-100/80 hover:text-cream-50 sm:inline short:hidden">
              {t("nav.rules")}
            </Link>
            <div className="short:hidden">
              <LanguageToggle />
            </div>
            {!isLoading && <MeChip />}
            <button
              type="button"
              onClick={() => setMenu(true)}
              className="hidden rounded-lg px-2 py-1.5 text-cream-50 hover:bg-white/10 short:inline-flex"
              aria-label={t("nav.menu")}
              title={t("nav.menu")}
            >
              <LuMenu className="icon" />
            </button>
          </nav>
        </div>
        {!isLoading && <OngoingLink />}
      </header>
      <main className="safe-bottom mx-auto w-full max-w-7xl flex-1 px-3 py-3 sm:px-4 sm:py-5 short:py-2">
        {isLoading ? (
          <Loading />
        ) : (
          <>
            <InstallAppBanner />
            <Outlet />
          </>
        )}
      </main>
      <Drawer open={menu} title={t("nav.menu")} onClose={() => setMenu(false)}>
        <MenuSheet onPick={() => setMenu(false)} />
      </Drawer>
    </div>
  );
}

const menuRow = "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-cream-50 hover:bg-white/10";

/** What the header has no room for on a phone on its side. */
function MenuSheet({ onPick }: { onPick: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-md space-y-3">
      <div className="rounded-xl bg-black/25 p-1">
        <Link to="/" className={menuRow} onClick={onPick}>
          <span className="w-4 text-center text-gold-400">♠</span> {t("nav.home")}
        </Link>
        <Link to="/rules" className={menuRow} onClick={onPick}>
          <LuBookOpen className="icon" /> {t("nav.rules")}
        </Link>
        <Link to="/account" className={menuRow} onClick={onPick}>
          <LuUser className="icon" /> {t("nav.account")}
        </Link>
      </div>
      <div className="flex items-center justify-between rounded-xl bg-black/25 px-4 py-3">
        <span className="text-sm font-semibold text-cream-50">{t("common.language")}</span>
        <LanguageToggle />
      </div>
    </div>
  );
}

/**
 * A live sitting is easy to wander away from, so it follows the player around the app
 * until they go back to it: a bar under the header, or on a phone on its side a chip in
 * it.
 */
function OngoingLink({ chip = false }: { chip?: boolean }) {
  const { t } = useTranslation();
  const ongoing = useQuery(api.games.ongoing);
  const path = useRouterState({ select: (s) => s.location.pathname });
  if (!ongoing) return null;
  if (path === `/g/${ongoing.gameId}/table`) return null;
  if (chip) {
    return (
      <Link
        to="/g/$gameId/table"
        params={{ gameId: ongoing.gameId }}
        className={`hidden min-w-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold short:inline-flex ${
          ongoing.isMyTurn ? "turn-pulse bg-gold-400 text-ink-900" : "bg-gold-400/15 text-gold-400"
        }`}
      >
        <span className="truncate">{ongoing.isMyTurn ? t("nav.ongoingTurn") : t("nav.resume")}</span>
      </Link>
    );
  }
  return (
    <Link
      to="/g/$gameId/table"
      params={{ gameId: ongoing.gameId }}
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-sm font-semibold transition short:hidden ${
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
      className="flex min-w-0 items-center gap-2 rounded-full border border-white/15 bg-black/20 py-1 pl-1 pr-3 text-cream-50 hover:bg-black/30 short:pr-1"
    >
      <Avatar seed={me.avatarSeed} size={28} className="shrink-0" />
      {/* A phone has room for a first name, not the whole generated one; on its side, none. */}
      <span className="max-w-[5.5rem] truncate text-sm font-medium sm:max-w-[10rem] short:hidden">{me.displayName}</span>
    </Link>
  );
}

export function Loading({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-center gap-3 py-20 text-cream-100/70 short:py-6">
      <span className="h-3 w-3 animate-bounce rounded-full bg-gold-400" />
      <span className="h-3 w-3 animate-bounce rounded-full bg-gold-400 [animation-delay:120ms]" />
      <span className="h-3 w-3 animate-bounce rounded-full bg-gold-400 [animation-delay:240ms]" />
      <span className="ml-2 text-sm">{label ?? t("common.loading")}</span>
    </div>
  );
}
