import { createFileRoute } from "@tanstack/react-router";
import type { Id } from "../../convex/_generated/dataModel";
import { HistoryView } from "@/components/game/HistoryView";

export const Route = createFileRoute("/g/$gameId/history")({ component: HistoryPage });

function HistoryPage() {
  const { gameId } = Route.useParams();
  return <HistoryView gameId={gameId as Id<"games">} />;
}
