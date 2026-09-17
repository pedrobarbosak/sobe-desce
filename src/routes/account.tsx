import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import { useTranslation } from "react-i18next";
import { useShortScreen } from "@/hooks/useMediaQuery";
import { LuDices, LuImage, LuMail, LuPalette } from "react-icons/lu";
import { api } from "../../convex/_generated/api";
import { authClient, signInCallback, signInWithProvider } from "@/lib/auth-client";
import { COLOURS, identityName, identitySeed, parseSeed, randomIdentity, recolourName, ANIMALS, MAX_DISPLAY_NAME_LENGTH } from "@/shared/names";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Crumbs } from "@/components/ui/Crumbs";
import { Loading } from "./__root";

export const Route = createFileRoute("/account")({ component: AccountPage });

function DiscordLogo() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden>
      <path d="M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0 12.6 12.6 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13 13 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.009c.12.099.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.8 19.8 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03M8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419s.955-2.419 2.157-2.419c1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" width="18" height="18" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

function AccountPage() {
  const { t } = useTranslation();
  const shortScreen = useShortScreen();
  const me = useQuery(api.users.me);
  const update = useMutation(api.users.updateProfile);
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [picking, setPicking] = useState(false);

  if (!me) return <Loading />;
  const displayName = name ?? me.displayName;
  const parsed = parseSeed(me.avatarSeed);

  const flash = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };
  const save = async () => {
    setBusy(true);
    try {
      await update({ displayName });
      flash();
    } finally {
      setBusy(false);
    }
  };
  const rerollName = async () => {
    const id = randomIdentity();
    setName(null);
    await update({ displayName: identityName(id), avatarSeed: identitySeed(id) });
  };
  const animalIndex = parsed ? ANIMALS.indexOf(parsed.animal) : 0;
  const colourIndex = parsed ? COLOURS.indexOf(parsed.colour) : 0;
  const chooseAnimal = async (animal: number) => {
    // The name is the player's own; swapping the icon must not rewrite it.
    await update({ avatarSeed: identitySeed({ animal, adjective: 0, colour: Math.max(0, colourIndex) }) });
  };
  const chooseColour = async (colour: number) => {
    const animal = Math.max(0, animalIndex);
    const nextName =
      colourIndex >= 0 ? recolourName(me.displayName, ANIMALS[animal]!, COLOURS[colourIndex]!, COLOURS[colour]!) : undefined;
    setName(null);
    await update({ avatarSeed: identitySeed({ animal, adjective: 0, colour }), displayName: nextName });
  };
  const rerollColour = async () => {
    const animal = parsed ? ANIMALS.indexOf(parsed.animal) : Math.floor(Math.random() * ANIMALS.length);
    const current = parsed ? COLOURS.indexOf(parsed.colour) : -1;
    let colour = Math.floor(Math.random() * COLOURS.length);
    if (colour === current) colour = (colour + 1) % COLOURS.length;
    const nextName = current >= 0
      ? recolourName(me.displayName, ANIMALS[animal]!, COLOURS[current]!, COLOURS[colour]!)
      : undefined;
    setName(null);
    await update({ avatarSeed: identitySeed({ animal, adjective: 0, colour }), displayName: nextName });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5 short:grid short:max-w-none short:grid-cols-2 short:items-start short:gap-4 short:space-y-0">
      <div className="space-y-2 short:col-span-2 short:space-y-1">
        <Crumbs trail={[{ label: t("nav.account") }]} />
        <h1 className="font-display text-4xl font-extrabold text-cream-50 short:text-2xl">{t("account.title")}</h1>
      </div>

      {me.isAnonymous && (
        <Panel className="border-gold-400/40 short:col-span-2">
          <p className="text-sm text-cream-100/90">{t("account.anonymousBanner")}</p>
        </Panel>
      )}

      <Panel className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          <Avatar seed={me.avatarSeed} size={shortScreen ? 56 : 88} />
          <div className="min-w-0 flex-1 space-y-2">
            <label className="block text-xs font-semibold text-cream-100/60">{t("account.name")}</label>
            <input
              value={displayName}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              className="w-full max-w-sm rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-cream-50 focus:border-gold-400 focus:outline-none"
            />
            <p className="text-xs text-cream-100/50">{t("account.identityHint")}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save()} disabled={busy || displayName.trim().length < 2 || displayName === me.displayName}>
            {saved ? t("common.saved") : t("common.save")}
          </Button>
          <Button variant="secondary" onClick={() => void rerollName()}>
            <LuDices className="icon" /> {t("account.newName")}
          </Button>
          <Button variant="secondary" onClick={() => setPicking(!picking)} aria-expanded={picking}>
            <LuImage className="icon" /> {picking ? t("account.done") : t("account.chooseIcon")}
          </Button>
          <Button variant="ghost" onClick={() => void rerollColour()}>
            <LuPalette className="icon" /> {t("account.newColour")}
          </Button>
        </div>

        {picking && (
          <div className="space-y-3 border-t border-white/10 pt-4">
            <div>
              <p className="text-xs font-semibold text-cream-100/60">{t("account.iconTitle")}</p>
              <p className="mt-0.5 text-xs text-cream-100/50">{t("account.iconHint")}</p>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2 short:max-h-36">
              <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-9 short:grid-cols-8">
                {ANIMALS.map((a, i) => (
                  <button
                    key={a.name}
                    type="button"
                    title={a.name}
                    aria-label={a.name}
                    aria-pressed={i === animalIndex}
                    onClick={() => void chooseAnimal(i)}
                    className={`flex items-center justify-center rounded-lg p-1 transition hover:bg-white/10 ${
                      i === animalIndex ? "bg-gold-400/25 ring-2 ring-gold-400" : ""
                    }`}
                  >
                    <Avatar seed={identitySeed({ animal: i, adjective: 0, colour: Math.max(0, colourIndex) })} size={34} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1.5 text-xs font-semibold text-cream-100/60">{t("account.colourTitle")}</p>
              <div className="flex flex-wrap gap-1.5">
                {COLOURS.map((c, i) => (
                  <button
                    key={c.name}
                    type="button"
                    title={c.name}
                    aria-label={c.name}
                    aria-pressed={i === colourIndex}
                    onClick={() => void chooseColour(i)}
                    className={`h-8 w-8 rounded-full transition hover:scale-110 short:h-6 short:w-6 ${
                      i === colourIndex ? "ring-2 ring-gold-400 ring-offset-2 ring-offset-felt-900" : "ring-1 ring-white/20"
                    }`}
                    style={{ background: `hsl(${c.hue} ${c.sat}% ${c.light}%)` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </Panel>

      {me.isAnonymous && (
      <Panel className="space-y-4">
        <h2 className="font-display text-xl font-bold text-cream-50">{t("account.linkTitle")}</h2>
        <p className="text-xs text-cream-100/60">{t("account.sameEmail")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void signInWithProvider("discord")}
            className="flex items-center justify-center gap-2 rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white shadow transition hover:bg-[#4752c4]"
          >
            <DiscordLogo />
            {t("account.continueDiscord")}
          </button>
          <button
            type="button"
            onClick={() => void signInWithProvider("microsoft")}
            className="flex items-center justify-center gap-2 rounded-xl border border-[#8c8c8c] bg-white px-4 py-3 text-sm font-semibold text-[#3c3c3c] shadow transition hover:bg-[#f3f3f3]"
          >
            <MicrosoftLogo />
            {t("account.continueMicrosoft")}
          </button>
        </div>
        <div className="border-t border-white/10 pt-4">
          <p className="mb-2 text-xs font-semibold text-cream-100/60">{t("account.emailTitle")}</p>
          <form
            className="flex flex-wrap items-stretch gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await authClient.signIn.magicLink({ email, callbackURL: signInCallback() });
                setSentTo(email);
              } finally {
                setBusy(false);
              }
            }}
          >
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("account.emailPlaceholder")}
              className="min-w-0 flex-1 rounded-xl border border-white/20 bg-black/30 px-3 py-2 text-cream-50 focus:border-gold-400 focus:outline-none"
              aria-label={t("account.email")}
            />
            <Button type="submit" variant="secondary" disabled={busy}>
              <LuMail className="icon" /> {t("account.sendLink")}
            </Button>
          </form>
          {sentTo && <p className="mt-2 text-sm text-gold-400">{t("account.sent", { email: sentTo })}</p>}
        </div>
      </Panel>
      )}

      {!me.isAnonymous && (
        <>
          <Panel className="border-felt-600 short:col-span-2">
            <SignedInWith />
          </Panel>
          <Button
            variant="ghost"
            onClick={async () => {
              await authClient.signOut();
              window.location.href = "/";
            }}
          >
            {t("account.signOut")}
          </Button>
        </>
      )}
    </div>
  );
}

type LinkedAccount = { id: string; providerId: string; accountId?: string };

/**
 * Who the session actually belongs to. `me` holds the editable in-game identity, which
 * says nothing about how the person got here, so the provider and the identity it carries
 * come straight from the auth session.
 */
function SignedInWith() {
  const { t } = useTranslation();
  const session = authClient.useSession();
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);

  useEffect(() => {
    let live = true;
    void authClient
      .listAccounts()
      .then((res) => {
        if (live) setAccounts((res.data as LinkedAccount[] | null) ?? []);
      })
      .catch(() => {
        if (live) setAccounts([]);
      });
    return () => {
      live = false;
    };
  }, [session.data?.user?.id]);

  const user = session.data?.user;
  const label = (id: string) => t(`account.provider.${id}`, { defaultValue: id });
  // The anonymous row is bookkeeping, not something the person chose.
  const linked = (accounts ?? []).filter((a) => a.providerId !== "anonymous");
  const primary = linked[0];

  return (
    <div className="space-y-1.5">
      <p className="text-sm text-cream-100/90">
        {primary ? t("account.signedInWith", { provider: label(primary.providerId) }) : t("account.signedInWithMany")}
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        {user?.name && <span className="font-semibold text-cream-50">{user.name}</span>}
        {user?.name && user?.email && <span className="text-cream-100/30">·</span>}
        <span className="text-cream-100/70">{user?.email ?? t("account.noEmail")}</span>
      </p>
      {linked.length > 1 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {linked.map((a) => (
            <span key={a.id} className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-cream-100/70">
              {label(a.providerId)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
