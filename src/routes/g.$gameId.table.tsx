import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Table } from "@/components/table/Table";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Loading } from "./__root";

export const Route = createFileRoute("/g/$gameId/table")({ component: TablePage });

function TablePage() {
  const { t } = useTranslation();
  const { gameId } = Route.useParams();
  const data = useQuery(api.game.table.get, { gameId: gameId as Id<"games"> });
  if (data === undefined) return <Loading />;
  if (data === null) {
    // The host threw the table away while we were sitting at it.
    return (
      <Panel className="mx-auto max-w-md text-center">
        <p className="text-cream-50">{t("errors.gameDeleted")}</p>
        <Link to="/" className="mt-3 inline-block">
          <Button variant="ghost">{t("nav.crumbHome")}</Button>
        </Link>
      </Panel>
    );
  }
  if (!data.session || !data.round) {
    return (
      <Panel className="mx-auto max-w-md text-center">
        <p className="text-cream-50">{t("table.sessionClosed")}</p>
        <Link to="/g/$gameId" params={{ gameId }} className="mt-3 inline-block">
          <Button variant="ghost">{t("table.backToLobby")}</Button>
        </Link>
      </Panel>
    );
  }
  return <Table data={data} />;
}
