/**
 * Player identities: "<Animal> <Adjetivo> <Cor>", e.g. "Raposa Curiosa Azul".
 * The avatar seed encodes the same animal and colour, so the picture matches the name.
 * Adjectives and colours agree with the animal's grammatical gender.
 */
type Gender = "f" | "m";
export const MAX_DISPLAY_NAME_LENGTH = 48;
// Existing animals default to feminine to preserve stored identity indexes.
/** `icon` is a react-icons/gi export name; the mapping to components lives in the Avatar. */
export type Animal = { name: string; icon: string; gender?: Gender };
export type Colour = { name: string; masculine?: string; hue: number; sat: number; light: number };

export const ANIMALS: readonly Animal[] = [
  { name: "Raposa", icon: "GiFox" },
  { name: "Coruja", icon: "GiOwl" },
  { name: "Lontra", icon: "FaOtter" },
  { name: "Andorinha", icon: "GiSwallow" },
  { name: "Cabra", icon: "GiGoat" },
  { name: "Sardinha", icon: "GiSalmon" },
  { name: "Lagartixa", icon: "GiGecko" },
  { name: "Tartaruga", icon: "GiTurtle" },
  { name: "Borboleta", icon: "GiButterfly" },
  { name: "Formiga", icon: "GiScarabBeetle" },
  { name: "Baleia", icon: "GiSpermWhale" },
  { name: "Abelha", icon: "GiBee" },
  { name: "Joaninha", icon: "GiLadybug" },
  { name: "Rã", icon: "GiFrog" },
  { name: "Girafa", icon: "GiCamelHead" },
  { name: "Zebra", icon: "GiHorseHead" },
  { name: "Foca", icon: "GiJugglingSeal" },
  { name: "Águia", icon: "GiEagleHead" },
  { name: "Galinha", icon: "GiChicken" },
  { name: "Ovelha", icon: "GiSheep" },
  { name: "Vaca", icon: "GiCow" },
  { name: "Cobra", icon: "GiSnake" },
  { name: "Lula", icon: "GiSquid" },
  { name: "Lagosta", icon: "GiCrabClaw" },
  { name: "Pomba", icon: "GiDove" },
  { name: "Aranha", icon: "GiSpiderAlt" },
  { name: "Ostra", icon: "GiOyster" },
  { name: "Loba", icon: "GiWolfHead" },
  { name: "Leoa", icon: "GiLion" },
  { name: "Gata", icon: "GiCat" },
  { name: "Cadela", icon: "GiSittingDog" },
  { name: "Ratinha", icon: "GiMouse" },
  { name: "Coelha", icon: "GiRabbit" },
  { name: "Tigresa", icon: "GiTiger" },
  { name: "Ursa", icon: "GiBearHead" },
  { name: "Macaca", icon: "GiMonkey" },
  { name: "Égua", icon: "GiHorseHead" },
  { name: "Porca", icon: "GiPig" },
  { name: "Pata", icon: "GiDuck" },
  { name: "Perua", icon: "GiRooster" },
  { name: "Cegonha", icon: "GiStorkDelivery" },
  { name: "Garça", icon: "GiHeron" },
  { name: "Gaivota", icon: "GiSeagull" },
  { name: "Perdiz", icon: "GiSparrow" },
  { name: "Codorniz", icon: "GiSparrow" },
  { name: "Arara", icon: "GiParrotHead" },
  { name: "Cacatua", icon: "GiParrotHead" },
  { name: "Avestruz", icon: "GiOstrich" },
  { name: "Pantera", icon: "GiSaberToothedCatHead" },
  { name: "Chita", icon: "GiLynxHead" },
  { name: "Hiena", icon: "GiHyenaHead" },
  { name: "Gazela", icon: "GiDeer" },
  { name: "Rena", icon: "GiStagHead" },
  { name: "Lebre", icon: "GiRabbitHead" },
  { name: "Chinchila", icon: "GiSeatedMouse" },
  { name: "Capivara", icon: "GiCapybara" },
  { name: "Doninha", icon: "GiSquirrel" },
  { name: "Enguia", icon: "GiEel" },
  { name: "Truta", icon: "GiFlyingTrout" },
  { name: "Pescada", icon: "GiTropicalFish" },
  { name: "Orca", icon: "GiWhaleTail" },
  { name: "Medusa", icon: "GiJellyfish" },
  { name: "Libélula", icon: "GiDragonfly" },
  { name: "Caracoleta", icon: "GiSnail" },
  { name: "Lobo", icon: "GiWolfHead", gender: "m" },
  { name: "Leão", icon: "GiLion", gender: "m" },
  { name: "Gato", icon: "GiCat", gender: "m" },
  { name: "Cão", icon: "GiSittingDog", gender: "m" },
  { name: "Rato", icon: "GiMouse", gender: "m" },
  { name: "Coelho", icon: "GiRabbit", gender: "m" },
  { name: "Tigre", icon: "GiTiger", gender: "m" },
  { name: "Urso", icon: "GiBearHead", gender: "m" },
  { name: "Macaco", icon: "GiMonkey", gender: "m" },
  { name: "Cavalo", icon: "GiHorseHead", gender: "m" },
  { name: "Porco", icon: "GiPig", gender: "m" },
  { name: "Pato", icon: "GiDuck", gender: "m" },
  { name: "Peru", icon: "GiRooster", gender: "m" },
  { name: "Galo", icon: "GiRooster", gender: "m" },
  { name: "Bode", icon: "GiGoat", gender: "m" },
  { name: "Carneiro", icon: "GiRam", gender: "m" },
  { name: "Touro", icon: "GiBull", gender: "m" },
  { name: "Veado", icon: "GiDeerHead", gender: "m" },
  { name: "Esquilo", icon: "GiSquirrel", gender: "m" },
  { name: "Ouriço", icon: "GiHedgehog", gender: "m" },
  { name: "Texugo", icon: "GiRaccoonHead", gender: "m" },
  { name: "Castor", icon: "GiBeaver", gender: "m" },
  { name: "Pinguim", icon: "GiPenguin", gender: "m" },
  { name: "Papagaio", icon: "GiParrotHead", gender: "m" },
  { name: "Flamingo", icon: "GiFlamingo", gender: "m" },
  { name: "Corvo", icon: "GiRaven", gender: "m" },
  { name: "Golfinho", icon: "GiDolphin", gender: "m" },
  { name: "Tubarão", icon: "GiSharkJaws", gender: "m" },
  { name: "Polvo", icon: "GiOctopus", gender: "m" },
  { name: "Caranguejo", icon: "GiCrab", gender: "m" },
  { name: "Camaleão", icon: "GiChameleonGlyph", gender: "m" },
  { name: "Caracol", icon: "GiSnail", gender: "m" },
];

export const ADJECTIVES: readonly string[] = [
  "Curiosa", "Astuta", "Valente", "Sorridente", "Teimosa", "Veloz", "Serena", "Matreira",
  "Feliz", "Sonhadora", "Atrevida", "Esperta", "Calma", "Risonha", "Lendária", "Mandona",
  "Sortuda", "Tímida", "Brincalhona", "Distraída", "Elegante", "Faladora", "Corajosa", "Zangada",
  "Alegre", "Audaz", "Aventureira", "Animada", "Atenta", "Ágil", "Destemida", "Divertida",
  "Encantadora", "Engraçada", "Espirituosa", "Estudiosa", "Famosa", "Fanfarrona", "Gentil", "Gulosa",
  "Habilidosa", "Imparável", "Irrequieta", "Jovial", "Leal", "Ligeira", "Manhosa", "Marota",
  "Meiga", "Misteriosa", "Notável", "Ousada", "Paciente", "Perspicaz", "Pícara", "Poderosa",
  "Prudente", "Radiante", "Rebelde", "Resmungona", "Sábia", "Saltitona", "Simpática", "Sossegada",
  "Talentosa", "Tenaz", "Traquina", "Tranquila", "Vaidosa", "Vigilante", "Vivaz", "Vitoriosa",
];

export const COLOURS: readonly Colour[] = [
  { name: "Azul", hue: 215, sat: 70, light: 50 },
  { name: "Verde", hue: 140, sat: 55, light: 42 },
  { name: "Vermelha", masculine: "Vermelho", hue: 2, sat: 70, light: 50 },
  { name: "Amarela", masculine: "Amarelo", hue: 48, sat: 85, light: 52 },
  { name: "Roxa", masculine: "Roxo", hue: 275, sat: 60, light: 50 },
  { name: "Laranja", hue: 28, sat: 85, light: 52 },
  { name: "Rosa", hue: 335, sat: 75, light: 62 },
  { name: "Dourada", masculine: "Dourado", hue: 42, sat: 80, light: 48 },
  { name: "Turquesa", hue: 178, sat: 65, light: 42 },
  { name: "Lilás", hue: 290, sat: 45, light: 65 },
  { name: "Castanha", masculine: "Castanho", hue: 25, sat: 50, light: 35 },
  { name: "Prateada", masculine: "Prateado", hue: 210, sat: 8, light: 62 },
  { name: "Preta", masculine: "Preto", hue: 220, sat: 10, light: 20 },
  { name: "Branca", masculine: "Branco", hue: 40, sat: 15, light: 88 },
  { name: "Violeta", hue: 270, sat: 65, light: 58 },
  { name: "Índigo", hue: 245, sat: 60, light: 40 },
  { name: "Ciano", hue: 185, sat: 80, light: 48 },
  { name: "Magenta", hue: 305, sat: 75, light: 48 },
  { name: "Coral", hue: 16, sat: 85, light: 64 },
  { name: "Salmão", hue: 10, sat: 70, light: 72 },
  { name: "Carmesim", hue: 348, sat: 75, light: 40 },
  { name: "Escarlate", hue: 5, sat: 85, light: 46 },
  { name: "Bordô", hue: 345, sat: 55, light: 28 },
  { name: "Bege", hue: 38, sat: 35, light: 78 },
  { name: "Creme", hue: 48, sat: 65, light: 85 },
  { name: "Marfim", hue: 55, sat: 40, light: 92 },
  { name: "Cinza", hue: 215, sat: 5, light: 50 },
  { name: "Cinzenta", masculine: "Cinzento", hue: 220, sat: 8, light: 42 },
  { name: "Acobreada", masculine: "Acobreado", hue: 22, sat: 60, light: 46 },
  { name: "Bronzeada", masculine: "Bronzeado", hue: 30, sat: 55, light: 40 },
  { name: "Âmbar", hue: 40, sat: 95, light: 50 },
  { name: "Ocre", hue: 38, sat: 65, light: 42 },
];

export type Identity = { animal: number; adjective: number; colour: number };

const MASCULINE_ADJECTIVES: Readonly<Record<string, string>> = {
  Mandona: "Mandão",
  Brincalhona: "Brincalhão",
  Fanfarrona: "Fanfarrão",
  Resmungona: "Resmungão",
  Saltitona: "Saltitão",
  Traquina: "Traquina",
};

export function adjectiveName(adjective: string, animal: Animal): string {
  if (animal.gender !== "m") return adjective;
  return MASCULINE_ADJECTIVES[adjective] ?? adjective.replace(/a$/, "o");
}

export function colourName(colour: Colour, animal: Animal): string {
  return animal.gender === "m" ? colour.masculine ?? colour.name : colour.name;
}

/** Update the colour in a generated name, leaving custom names alone. */
export function recolourName(name: string, animal: Animal, current: Colour, next: Colour): string | undefined {
  const words = name.trim().split(/\s+/);
  if (words.length !== 3 || words[0] !== animal.name) return undefined;
  if (!ADJECTIVES.some((adjective) => adjectiveName(adjective, animal) === words[1])) return undefined;
  if (words[2] !== colourName(current, animal)) return undefined;
  return `${words[0]} ${words[1]} ${colourName(next, animal)}`;
}

export function randomIdentity(rand: () => number = Math.random): Identity {
  return {
    animal: Math.floor(rand() * ANIMALS.length),
    adjective: Math.floor(rand() * ADJECTIVES.length),
    colour: Math.floor(rand() * COLOURS.length),
  };
}

export function identityName(id: Identity): string {
  const animal = ANIMALS[id.animal]!;
  return `${animal.name} ${adjectiveName(ADJECTIVES[id.adjective]!, animal)} ${colourName(COLOURS[id.colour]!, animal)}`;
}

/** Avatar seed that carries the animal and colour: "id:<animal>:<colour>:<salt>". */
export function identitySeed(id: Identity, salt = 0): string {
  return `id:${id.animal}:${id.colour}:${salt}`;
}

export function parseSeed(seed: string): { animal: Animal; colour: Colour } | null {
  const m = /^id:(\d+):(\d+)(?::\d+)?$/.exec(seed);
  if (!m) return null;
  const animal = ANIMALS[Number(m[1]) % ANIMALS.length]!;
  const colour = COLOURS[Number(m[2]) % COLOURS.length]!;
  return { animal, colour };
}

/** Recover the animal and colour from a generated display name (used server-side). */
export function seedFromName(name: string, rand: () => number = Math.random): string {
  const words = name.split(/\s+/);
  const animal = ANIMALS.findIndex((a) => words.includes(a.name));
  const colour = COLOURS.findIndex((c) => words.includes(c.name) || (c.masculine !== undefined && words.includes(c.masculine)));
  return identitySeed({
    animal: animal >= 0 ? animal : Math.floor(rand() * ANIMALS.length),
    adjective: 0,
    colour: colour >= 0 ? colour : Math.floor(rand() * COLOURS.length),
  });
}

export function randomName(rand: () => number = Math.random): string {
  return identityName(randomIdentity(rand));
}

export function randomSeed(rand: () => number = Math.random): string {
  return identitySeed(randomIdentity(rand));
}

export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BOT_NAMES = [
  "Zé Bot", "Bot Amélia", "Bot Tó", "Bot Rita", "Bot Chico", "Bot Inês", "Bot Rui", "Bot Ana",
  "Bot Manel", "Bot Maria", "Bot Joaquim", "Bot Joana", "Bot António", "Bot Beatriz", "Bot Pedro", "Bot Leonor",
  "Bot João", "Bot Matilde", "Bot Tiago", "Bot Carolina", "Bot Miguel", "Bot Mariana", "Bot Diogo", "Bot Catarina",
  "Bot Afonso", "Bot Francisca", "Bot Duarte", "Bot Mafalda", "Bot Vasco", "Bot Teresa", "Bot Nuno", "Bot Filipa",
  "Bot Gonçalo", "Bot Sofia", "Bot Tomás", "Bot Alice", "Bot Salvador", "Bot Clara", "Bot Dinis", "Bot Luísa",
];
export function botName(index: number): string {
  return BOT_NAMES[index % BOT_NAMES.length]!;
}

/** A bot name nobody at the table is using yet; falls back to a numbered one when all are taken. */
export function randomBotName(taken: readonly string[], rand: () => number = Math.random): string {
  const used = new Set(taken);
  const free = BOT_NAMES.filter((n) => !used.has(n));
  if (free.length > 0) return free[Math.floor(rand() * free.length)]!;
  let i = 2;
  while (used.has(`Bot ${i}`)) i++;
  return `Bot ${i}`;
}

const TABLE_PREFIX = [
  "Mesa", "Tasca", "Taberna", "Café", "Cantina", "Salão", "Esplanada", "Adega",
  "Tertúlia", "Petisqueira", "Taverna", "Botequim", "Quiosque", "Pátio", "Largo", "Recanto",
  "Cantinho", "Varanda", "Terraço", "Clube", "Associação", "Coletividade", "Retiro", "Arraial",
];
const TABLE_SUFFIX = [
  "do Sete de Ouros", "do Ás Teimoso", "do Trunfo Perdido", "das Copas Dobradas", "da Última Vaza",
  "dos Paus Forçados", "da Subida", "do Baralho Torto", "da Vaza Roubada", "do Rei Manhoso",
  "do Valete Preguiçoso", "da Dama de Espadas", "do Dois Miserável", "das Cinco Vazas", "do Zero Redondo",
  "do Passa a Ronda", "dos Trunfos Tristes", "da Esquina", "do Bairro", "da Faculdade",
  "do Ás Escondido", "do Rei de Copas", "da Dama Sortuda", "do Valete Matreiro", "do Trunfo Maroto",
  "da Vaza Certa", "da Vaza Impossível", "da Primeira Mão", "da Última Carta", "do Baralho Novo",
  "das Cartas Marcadas", "dos Ouros Perdidos", "das Espadas Afiadas", "dos Paus Trocados", "das Copas Cheias",
  "do Sete Sortudo", "do Dois Valente", "da Ronda Perfeita", "da Descida Triunfal", "da Subida Difícil",
  "do Zero Glorioso", "dos Cinco Magníficos", "do Corte Certeiro", "do Grande Desempate", "da Sorte Grande",
  "do Azar Passageiro", "da Mão Cheia", "do Jogo Renhido", "da Revanche", "dos Campeões",
  "da Bica", "do Pastel de Nata", "dos Petiscos", "da Sardinha Assada", "do Caldo Verde",
  "da Praça", "do Miradouro", "da Ribeira", "do Coreto", "dos Bons Amigos",
];
export function randomTableName(rand: () => number = Math.random): string {
  const p = TABLE_PREFIX[Math.floor(rand() * TABLE_PREFIX.length)]!;
  const s = TABLE_SUFFIX[Math.floor(rand() * TABLE_SUFFIX.length)]!;
  return `${p} ${s}`;
}
