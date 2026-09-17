import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { LuChevronDown } from "react-icons/lu";
import { useShortScreen } from "@/hooks/useMediaQuery";
import { LIGHTNING_SECONDS, TWISTS, type Twist } from "@/engine";
import { PARTY_TWIST_ICONS } from "@/components/table/partyIcons";
import { Panel } from "@/components/ui/Panel";

export const Route = createFileRoute("/rules")({ component: RulesPage });

type RulesSection = { h: string; p: string[]; partyEvents?: boolean };
type RulesCopy = { sections: RulesSection[] };

const PT: RulesCopy = {
  sections: [
    { h: "Objetivo", p: ["Aqui joga cada um por si. Todos começam com os mesmos pontos e o objetivo é chegar a 0. Os pontos são contados no fim de cada ronda; se desceres abaixo de 0, ficas em 0.", "Se vários jogadores chegarem a 0 na mesma ronda, ganha quem ficaria com menos pontos antes desse ajuste. Em caso de empate, ganha quem vier primeiro na ordem de jogo, a partir da esquerda de quem deu as cartas."] },
    { h: "Cartas", p: ["Baralho de 40: A, 7, K, J, Q, 6, 5, 4, 3, 2 (do mais alto ao mais baixo).", "Baralho de 52: A, 7, K, J, Q, 10, 9, 8, 6, 5, 4, 3, 2. O A, o 7, o K, o J e o Q têm moldura dourada para lembrar que batem o 10, o 9 e o 8."] },
    { h: "Ronda", p: ["1. Dão-se 3 cartas a cada um, a começar à esquerda de quem dá.", "2. O jogador à esquerda de quem dá escolhe o trunfo, ou vira a carta seguinte do baralho e o naipe dela manda. A carta virada fica à vista de todos e vai para a mão de quem virou.", "2b. Copas no escuro: nos primeiros segundos da ronda, antes de lhe mostrarem uma única carta, esse jogador pode chamar copas às cegas. Recebe logo as 5 cartas e a ronda conta a quádruplo, a ganhar e a perder. Só pode fazê-lo quem tiver pelo menos quatro vezes a penalização em pontos (20, com a penalização de 5). Se deixar passar o tempo, vê as cartas e escolhe como sempre.", "3. Dão-se mais 2 cartas a cada um, ficando todos com 5.", "4. Na sua vez, cada jogador escolhe se quer trocar cartas, jogar com as que tem ou passar a ronda. As trocas têm um limite e nem sempre é permitido passar.", "5. Jogam-se 5 vazas. Começa o primeiro jogador que vai jogar a ronda, a contar da esquerda de quem deu as cartas.", "6. Fazem-se as contas e passa a vez de dar as cartas ao jogador seguinte."] },
    { h: "Passar a ronda", p: ["Não podes passar mais de 2 rondas seguidas, nem quando tens menos pontos do que o limite definido na mesa, nem quando o trunfo é paus. Se escolheres jogar, com ou sem troca de cartas, já não podes passar essa ronda.", "Quem escolhe o naipe do trunfo fica logo comprometido e tem de jogar a ronda. Quem prefere virar a carta não fica: pode na mesma passar."] },
    { h: "Vazas", p: ["Uma vaza é uma volta à mesa em que cada jogador em jogo lança uma carta. Tens de assistir: jogar uma carta do mesmo naipe da primeira carta da vaza. Se não tiveres esse naipe, só és obrigado a trunfar se algum dos teus trunfos bater a carta que está a ganhar, e nesse caso tens de jogar um que bata. Se nenhum bater, jogas o que quiseres.", "Sobe: ao assistir ou trunfar, se puderes bater a carta que está a ganhar, tens de o fazer.", "Se fores o primeiro a jogar numa vaza e tiveres o ás de trunfo, tens de sair com ele. Ganha o trunfo mais alto; se ninguém trunfar, ganha a carta mais alta do naipe de saída. Quem ganha a vaza começa a seguinte."] },
    { h: "Pontos", p: ["Cada vaza tira-te 1 ponto. Se jogares e não fizeres nenhuma, somas 5 pontos, a menos que a mesa tenha outra penalização definida. Se passares a ronda, os teus pontos não mudam.", "Com copas como trunfo, conta tudo a dobrar: tiras 2 pontos por vaza e a penalização por não fazer nenhuma também duplica. Se as copas foram chamadas no escuro, conta tudo a quádruplo. Com paus, ninguém pode passar a ronda."] },
    { h: "Limite de troca", p: ["O número de cartas que podes trocar depende do baralho e de quantos jogadores estão à mesa. O limite fica entre 1 e 5 cartas.", "Com 40 cartas: 4 jogadores podem trocar até 5 cartas cada; 5 jogadores, até 3; 6 jogadores, apenas 1.", "Com 52 cartas: 4 ou 5 jogadores podem trocar até 5 cartas cada; 6 jogadores, até 3; 7 jogadores, até 2; 8 jogadores, apenas 1."] },
    { h: "Festa", partyEvents: true, p: ["Na variante Festa, cada ronda revela uma reviravolta antes de se escolher o trunfo, nunca a mesma duas rondas seguidas. Tudo o resto joga-se como no clássico."] },
    { h: "Campanha", p: ["Podes juntar até 16 inscritos, mesmo que não caibam todos à mesa ao mesmo tempo. Em cada sessão, joga quem aparece. Quando a sessão começa, o grupo fica definido e o limite de troca é ajustado ao número de jogadores. Quem não joga mantém os seus pontos. A campanha termina quando alguém chega a 0 no fim de uma ronda."] },
  ],
};

const EN: RulesCopy = {
  sections: [
    { h: "Goal", p: ["A trick-taking game with no partnerships. Everyone starts on the same score and races down to exactly 0. First to 0 wins immediately. Going below 0 lands on 0 and wins."] },
    { h: "Cards", p: ["40-card deck: A, 7, K, J, Q, 6, 5, 4, 3, 2 (high to low).", "52-card deck: A, 7, K, J, Q, 10, 9, 8, 6, 5, 4, 3, 2. The A, 7, K, J and Q wear a gold frame as a reminder that they beat the 10, 9 and 8."] },
    { h: "Round", p: ["1. Deal 3 cards each, starting left of the dealer.", "2. The player left of the dealer names trump, or flips the next card off the stock and takes its suit. The flipped card is shown to the table and goes into the flipper\u2019s hand.", "2b. Hearts in the dark: for the first seconds of the round, before being shown a single card, that player may call hearts blind. They get all 5 cards at once and the round counts fourfold, winning and losing alike. Only a player holding at least four times the blank penalty in points may call it (20, with the default penalty of 5). Let the window lapse and they see their cards and choose as usual.", "3. Deal 2 more (5 total).", "4. In order, each player discards 0 up to the cap and draws, or sits the round out.", "5. Play 5 tricks, led by the player left of the dealer.", "6. Score, then the deal rotates."] },
    { h: "Sitting out", p: ["You may not sit out more than 2 rounds in a row, nor below the forced-play threshold, nor when Clubs are trump. Once you discard you are committed.", "Naming the suit commits you to the round. Flipping for it does not: a flipper may still sit out."] },
    { h: "Tricks", p: ["Follow the led suit if you can. If void, you only have to trump when one of your trumps actually beats the winning card, and then you must play a beating one. If none of them beats it, play anything.", "Sobe: when following suit or trumping, if you can beat the winning card you must.", "If you hold the Ace of trumps and it is your lead, you must lead it. Highest trump wins, else highest of the led suit. The winner leads next."] },
    { h: "Scoring", p: ["-1 per trick. +5 if you played and won none. Sitting out changes nothing.", "Hearts: everything doubles (-2 per trick, +10 for a blank). Hearts called in the dark: everything quadruples. Clubs: nobody may sit out."] },
    { h: "Discard cap", p: ["Derived from deck and seated players: floor(cards / players) - 5, clamped to 1..5. 40 cards: 4→5, 5→3, 6→1. 52 cards: 4→5, 5→5, 6→3, 7→2, 8→1."] },
    { h: "Party", partyEvents: true, p: ["In the Party variant, every round reveals a public twist before trump is chosen, never the same one twice in a row. Everything else plays as Classic."] },
    { h: "Campaign", p: ["Up to 16 enrolled, more than the seats. Each sitting, whoever shows up plays; the seat count locks and the discard cap is recomputed. Absent players are frozen. The game ends the moment anyone reaches 0."] },
  ],
};

type T = (key: string, options?: Record<string, unknown>) => string;

function partyEventText(twist: Twist, t: T): { name: string; description: string } {
  const variables = {
    suit: t("suits.D").split(" ")[0],
    rank: "7",
    seconds: LIGHTNING_SECONDS,
    count: 2,
  };
  const name = twist === "pass"
    ? t("party.passNames.left", { count: variables.count })
    : t(`party.twists.${twist}.name`, variables);
  return { name, description: t(`party.twists.${twist}.desc`, variables) };
}

function PartyEventCatalog() {
  const { t } = useTranslation();
  const tr = t as unknown as T;
  return (
    <section className="mt-6 border-t border-ink-900/10 pt-5" aria-labelledby="party-events-heading">
      <div className="max-w-2xl">
        <h3 id="party-events-heading" className="font-display text-2xl font-bold text-ink-900">
          {t("party.eventCatalogTitle")}
        </h3>
        <p className="mt-1 text-sm text-ink-500">{t("party.eventCatalogHint")}</p>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 short:grid-cols-3">
        {TWISTS.map((twist) => {
          const event = partyEventText(twist, tr);
          const Icon = PARTY_TWIST_ICONS[twist];
          return (
            <li
              key={twist}
              className="rounded-xl border border-purple-950/15 bg-white/55 p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-950 text-white shadow-sm"
                  aria-hidden="true"
                >
                  <Icon className="h-6 w-6" />
                </span>
                <div className="min-w-0">
                  <h4 className="font-display text-base font-bold leading-tight text-ink-900">{event.name}</h4>
                  <p className="mt-1.5 text-sm leading-relaxed text-ink-700">{event.description}</p>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RulesPage() {
  const { t, i18n } = useTranslation();
  const rules = i18n.language.startsWith("en") ? EN : PT;
  // A phone on its side shows three lines at a time: the sections fold to their titles.
  const short = useShortScreen();
  return (
    <div className="mx-auto max-w-5xl space-y-4 short:space-y-2">
      <h1 className="font-display text-4xl font-extrabold text-cream-50 short:text-2xl">{t("nav.rules")}</h1>
      {rules.sections.map((s) => (
        <Panel key={s.h}>
          <details open={!short} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <h2 className="font-display text-xl font-bold text-gold-400 short:text-base">{s.h}</h2>
              <LuChevronDown className="icon shrink-0 text-cream-100/50 transition group-open:rotate-180" aria-hidden />
            </summary>
            <div className={s.partyEvents ? "" : "max-w-3xl"}>
              <div className="mt-2 space-y-1.5 text-sm text-cream-100/90">
                {s.p.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            </div>
            {s.partyEvents && <PartyEventCatalog />}
          </details>
        </Panel>
      ))}
    </div>
  );
}
