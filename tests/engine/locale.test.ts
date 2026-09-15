import { createInstance } from "i18next";
import { describe, expect, it } from "vitest";
import pt from "@/i18n/pt.json";
import en from "@/i18n/en.json";

function strings(value: unknown, prefix = ""): Record<string, string> {
  if (typeof value === "string") return { [prefix]: value };
  return Object.fromEntries(Object.entries(value as object).flatMap(([key, child]) =>
    Object.entries(strings(child, prefix ? `${prefix}.${key}` : key))));
}

describe("Portuguese translations", () => {
  it("covers every English string and preserves interpolation variables", () => {
    const translated = strings(pt);
    for (const [key, value] of Object.entries(strings(en))) {
      expect(translated[key], key).toBeDefined();
      expect((translated[key]!.match(/\{\{\w+\}\}/g) ?? []).sort(), key)
        .toEqual((value.match(/\{\{\w+\}\}/g) ?? []).sort());
    }
  });

  it("uses Portugal's plural forms, including zero", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "pt-PT", fallbackLng: "pt-PT", resources: { "pt-PT": { translation: pt } } });
    expect(i18n.t("history.rounds", { count: 0 })).toBe("0 rondas");
    expect(i18n.t("history.rounds", { count: 1 })).toBe("1 ronda");
    expect(i18n.t("history.rounds", { count: 2 })).toBe("2 rondas");
    expect(i18n.t("join.players", { count: 1 })).toBe("1 jogador");
    expect(i18n.t("standings.sessionsPlayed", { count: 1 })).toBe("1 sessão");
    expect(i18n.t("table.discardN", { count: 1 })).toBe("Trocar 1 carta");
    expect(i18n.t("party.passNames.left", { count: 1 })).toBe("Passa 1 carta à esquerda");
    expect(i18n.t("party.passNames.left", { count: 2 })).toBe("Passa 2 cartas à esquerda");
  });

  it("pluralizes Party pass titles in English", async () => {
    const i18n = createInstance();
    await i18n.init({ lng: "en", fallbackLng: "en", resources: { en: { translation: en } } });
    expect(i18n.t("party.passNames.right", { count: 1 })).toBe("Pass 1 card right");
    expect(i18n.t("party.passNames.right", { count: 2 })).toBe("Pass 2 cards right");
  });
});
