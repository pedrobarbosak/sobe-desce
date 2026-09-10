import { useEffect, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { LobbyView } from "@/components/game/LobbyView";

export const Route = createFileRoute("/g/$gameId/")({ component: LobbyPage });

function LobbyPage() {
  const navigate = useNavigate();
  const { gameId: raw } = Route.useParams();
  const gameId = raw as Id<"games">;
  const data = useQuery(api.games.get, { gameId });
  const seatedSessionId = data?.session?.status === "active" && data.me ? data.session._id : null;

  // Jump to the felt when the host deals, but only on that transition: opening the lobby
  // during a live sitting is a deliberate visit and must not bounce straight back.
  const seen = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (data === undefined) return;
    const before = seen.current;
    seen.current = seatedSessionId;
    if (before === undefined || before === seatedSessionId || !seatedSessionId) return;
    void navigate({ to: "/g/$gameId/table", params: { gameId } });
  }, [data, seatedSessionId, gameId, navigate]);

  return <LobbyView gameId={gameId} />;
}
