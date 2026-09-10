import { describe, expect, it } from "vitest";
import {
  ADJECTIVES, ANIMALS, COLOURS, MAX_DISPLAY_NAME_LENGTH,
  identityName, identitySeed, parseSeed, recolourName, seedFromName,
} from "@/shared/names";

const animal = (name: string) => ANIMALS.findIndex((entry) => entry.name === name);
const colour = (name: string) => COLOURS.findIndex((entry) => entry.name === name);
const nameFor = (a: string, adjective: string, c: string) => identityName({
  animal: animal(a), adjective: ADJECTIVES.indexOf(adjective), colour: colour(c),
});

describe("Portuguese player names", () => {
  it.each([
    ["Raposa", "Curiosa", "Vermelha", "Raposa Curiosa Vermelha"],
    ["Lobo", "Curiosa", "Vermelha", "Lobo Curioso Vermelho"],
    ["Gato", "Brincalhona", "Branca", "Gato Brincalhão Branco"],
    ["Leão", "Mandona", "Dourada", "Leão Mandão Dourado"],
    ["Urso", "Resmungona", "Castanha", "Urso Resmungão Castanho"],
    ["Galo", "Fanfarrona", "Preta", "Galo Fanfarrão Preto"],
    ["Coelho", "Saltitona", "Prateada", "Coelho Saltitão Prateado"],
    ["Pato", "Traquina", "Laranja", "Pato Traquina Laranja"],
    ["Polvo", "Feliz", "Rosa", "Polvo Feliz Rosa"],
    ["Tigre", "Valente", "Turquesa", "Tigre Valente Turquesa"],
    ["Corvo", "Sábia", "Cinzenta", "Corvo Sábio Cinzento"],
  ])("agrees correctly: %s / %s / %s", (a, adjective, c, expected) => {
    expect(nameFor(a, adjective, c)).toBe(expected);
  });

  it("keeps existing identity indexes stable", () => {
    expect(identityName({ animal: 0, adjective: 0, colour: 0 })).toBe("Raposa Curiosa Azul");
    expect(parseSeed("id:31:13:7")).toEqual({
      animal: expect.objectContaining({ name: "Ratinha" }),
      colour: expect.objectContaining({ name: "Branca" }),
    });
  });

  it("recovers the avatar from every animal and colour in both genders", () => {
    for (let a = 0; a < ANIMALS.length; a++) {
      for (let c = 0; c < COLOURS.length; c++) {
        const id = { animal: a, adjective: 0, colour: c };
        expect(seedFromName(identityName(id))).toBe(identitySeed(id));
      }
    }
  });

  it("keeps the longest generated names within the profile limit", () => {
    for (let a = 0; a < ANIMALS.length; a++) {
      for (let adjective = 0; adjective < ADJECTIVES.length; adjective++) {
        for (let c = 0; c < COLOURS.length; c++) {
          if (identityName({ animal: a, adjective, colour: c }).length > MAX_DISPLAY_NAME_LENGTH) {
            throw new Error("Generated name exceeds the profile limit");
          }
        }
      }
    }
  });

  it.each([
    ["Lobo", "Lobo Curioso Vermelho", "Lobo Curioso Dourado"],
    ["Raposa", "Raposa Curiosa Vermelha", "Raposa Curiosa Dourada"],
  ])("keeps gender agreement when recolouring %s", (a, before, after) => {
    expect(recolourName(before, ANIMALS[animal(a)]!, COLOURS[colour("Vermelha")]!, COLOURS[colour("Dourada")]!)).toBe(after);
  });

  it("does not rewrite a custom name containing a colour", () => {
    expect(recolourName("Ana Rosa", ANIMALS[0]!, COLOURS[colour("Rosa")]!, COLOURS[0]!)).toBeUndefined();
  });
});
