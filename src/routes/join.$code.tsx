import { useEffect, useRef, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { errorCode } from "@/lib/errors";
import { Loading } from "./__root";

export const Route = createFileRoute("/join/$code")({ component: JoinPage });

function JoinPage() {
  const { t } = useTranslation();
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const preview = useQuery(api.games.byCode, { code });
  const join = useMutation(api.games.joinByCode);
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (!preview || attempted.current) return;
    attempted.current = true;
    join({ code })
      .then(({ gameId }) => navigate({ to: "/g/$gameId", params: { gameId }, replace: true }))
      .catch((err) => setError(errorCode(err)));
  }, [preview, code, join, navigate]);

  if (preview === undefined) return <Loading />;
  if (preview === null) {
    return (
      <Panel className="mx-auto max-w-md text-center">
        <p className="text-cream-50">{t("join.notFound")}</p>
        <Link to="/" className="mt-4 inline-block">
          <Button variant="ghost">{t("common.back")}</Button>
        </Link>
      </Panel>
    );
  }
  return (
    <Panel className="mx-auto max-w-md space-y-3 text-center">
      <p className="font-display text-base italic text-gold-400">{t("join.title")}</p>
      <h1 className="font-display text-3xl font-bold text-cream-50">{preview.name}</h1>
      <p className="text-sm text-cream-100/70">
        {t(`modes.${preview.mode}`)}, {t("join.players", { count: preview.playerCount })}
      </p>
      {error ? (
        <>
          <p className="text-heart">{t(`join.${error}`, { defaultValue: t(`errors.${error}`, { defaultValue: error }) })}</p>
          <Link to="/g/$gameId" params={{ gameId: preview.gameId }}>
            <Button variant="ghost">{t("lobby.goToTable")}</Button>
          </Link>
        </>
      ) : (
        <Loading label={t("join.joining")} />
      )}
    </Panel>
  );
}
