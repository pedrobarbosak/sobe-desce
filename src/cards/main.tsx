import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/fraunces/opsz.css";
import "@fontsource-variable/inter/opsz.css";
import "../index.css";
import { type DeckSize, SUITS, SUIT_NAMES_PT, SUIT_SYMBOLS, makeCard, ranksFor } from "@/engine";
import { CardBack, CardFace } from "@/components/table/Card";

const SIZES = [48, 72, 110, 150] as const;

/** Every card in the deck, strongest first, in the states the table puts them in. */
function CardsPage() {
  const [deck, setDeck] = useState<DeckSize>(52);
  const [width, setWidth] = useState<number>(72);
  const ranks = ranksFor(deck);

  return (
    <div className="felt min-h-full px-4 py-6 text-cream-100">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-extrabold text-cream-50">
              <span className="text-gold-400">♠</span> Cartas
            </h1>
            <p className="mt-1 text-sm text-cream-100/70">Do mais alto ao mais baixo. As de moldura dourada batem o 10, o 9 e o 8.</p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <Toggle label="Baralho" value={deck} options={[40, 52] as const} onChange={setDeck} />
            <Toggle label="Tamanho" value={width} options={SIZES} onChange={setWidth} />
          </div>
        </header>

        {SUITS.map((suit) => (
          <section key={suit} className="space-y-2">
            <h2 className="font-display text-lg font-bold text-gold-400">
              {SUIT_SYMBOLS[suit]} {SUIT_NAMES_PT[suit]}
            </h2>
            <div className="flex flex-wrap gap-3">
              {ranks.map((rank) => (
                <CardFace key={rank} card={makeCard(rank, suit)} width={width} />
              ))}
            </div>
          </section>
        ))}

        <section className="space-y-2">
          <h2 className="font-display text-lg font-bold text-gold-400">Estados</h2>
          <div className="flex flex-wrap items-end gap-6">
            <State label="normal"><CardFace card="7H" width={width} /></State>
            <State label="selecionada"><CardFace card="7S" width={width} selected /></State>
            <State label="indisponível"><CardFace card="QD" width={width} dimmed /></State>
            <State label="a ganhar"><CardFace card="KC" width={width} className="leading-card" /></State>
            <State label="ganhou a vaza"><CardFace card="JH" width={width} className="winning-card" /></State>
            <State label="costas"><CardBack width={width} /></State>
          </div>
        </section>
      </div>
    </div>
  );
}

function Toggle<T extends number>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex items-center gap-2" role="group" aria-label={label}>
      <span className="text-cream-100/60">{label}</span>
      <div className="flex overflow-hidden rounded-lg border border-white/15">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={o === value}
            className={`px-3 py-1 font-semibold ${o === value ? "bg-gold-400 text-ink-900" : "bg-black/20 hover:bg-white/10"}`}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

function State({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {children}
      <span className="text-xs text-cream-100/60">{label}</span>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CardsPage />
  </React.StrictMode>,
);
