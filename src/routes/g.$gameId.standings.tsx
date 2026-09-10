import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { StandingsView } from "@/components/game/StandingsView";

export const Route = createFileRoute("/g/$gameId/standings")({ component: StandingsPage });

function StandingsPage() {
  const { gameId } = Route.useParams();
  return <StandingsView gameId={gameId as Id<"games">} />;
}
