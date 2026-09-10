import type { IconType } from "react-icons";
import { GiBearHead, GiBeaver, GiBee, GiBull, GiButterfly, GiCamelHead, GiCapybara, GiCat, GiChameleonGlyph, GiChicken, GiCow, GiCrab, GiCrabClaw, GiDeer, GiDeerHead, GiDolphin, GiDove, GiDragonfly, GiDuck, GiEagleHead, GiEel, GiFlamingo, GiFlyingTrout, GiFox, GiFrog, GiGecko, GiGoat, GiHedgehog, GiHeron, GiHorseHead, GiHyenaHead, GiJellyfish, GiJugglingSeal, GiLadybug, GiLion, GiLynxHead, GiMonkey, GiMouse, GiOctopus, GiOstrich, GiOwl, GiOyster, GiParrotHead, GiPenguin, GiPig, GiRabbit, GiRabbitHead, GiRaccoonHead, GiRam, GiRaven, GiRooster, GiSaberToothedCatHead, GiSalmon, GiScarabBeetle, GiSeagull, GiSeatedMouse, GiSharkJaws, GiSheep, GiSittingDog, GiSnail, GiSnake, GiSparrow, GiSpermWhale, GiSpiderAlt, GiSquid, GiSquirrel, GiStagHead, GiStorkDelivery, GiSwallow, GiTiger, GiTropicalFish, GiTurtle, GiWhaleTail, GiWolfHead } from "react-icons/gi";
import { FaOtter } from "react-icons/fa6";
import { ANIMALS, COLOURS, type Colour, hashSeed, parseSeed } from "@/shared/names";

/** Animal silhouettes, keyed by the icon name stored in names.ts. */
const ICONS: Record<string, IconType> = { GiBearHead, GiBeaver, GiBee, GiBull, GiButterfly, GiCamelHead, GiCapybara, GiCat, GiChameleonGlyph, GiChicken, GiCow, GiCrab, GiCrabClaw, GiDeer, GiDeerHead, GiDolphin, GiDove, GiDragonfly, GiDuck, GiEagleHead, GiEel, GiFlamingo, GiFlyingTrout, GiFox, GiFrog, GiGecko, GiGoat, GiHedgehog, GiHeron, GiHorseHead, GiHyenaHead, GiJellyfish, GiJugglingSeal, GiLadybug, GiLion, GiLynxHead, GiMonkey, GiMouse, GiOctopus, GiOstrich, GiOwl, GiOyster, GiParrotHead, GiPenguin, GiPig, GiRabbit, GiRabbitHead, GiRaccoonHead, GiRam, GiRaven, GiRooster, GiSaberToothedCatHead, GiSalmon, GiScarabBeetle, GiSeagull, GiSeatedMouse, GiSharkJaws, GiSheep, GiSittingDog, GiSnail, GiSnake, GiSparrow, GiSpermWhale, GiSpiderAlt, GiSquid, GiSquirrel, GiStagHead, GiStorkDelivery, GiSwallow, GiTiger, GiTropicalFish, GiTurtle, GiWhaleTail, GiWolfHead, FaOtter };

function palette(c: Colour) {
  // Light colours sit on a dark tinted disc, dark colours on a pale one, so the icon
  // itself always carries the identity colour and stays readable.
  const onDark = c.light > 58;
  return {
    icon: `hsl(${c.hue} ${c.sat}% ${c.light}%)`,
    background: onDark
      ? `radial-gradient(circle at 35% 30%, hsl(${c.hue} ${Math.min(60, c.sat)}% 30%), hsl(${c.hue} ${Math.min(60, c.sat)}% 16%) 72%)`
      : `radial-gradient(circle at 35% 30%, hsl(${c.hue} ${Math.min(70, c.sat + 10)}% 94%), hsl(${c.hue} ${Math.min(60, c.sat)}% 82%) 72%)`,
    ring: `hsl(${c.hue} ${c.sat}% ${onDark ? Math.min(85, c.light + 10) : Math.max(28, c.light - 6)}%)`,
  };
}

export function avatarStyle(seed: string) {
  const parsed = parseSeed(seed);
  if (parsed) return { Icon: ICONS[parsed.animal.icon] ?? GiFox, ...palette(parsed.colour) };
  // Legacy seeds without an identity: hash to something stable.
  const h = hashSeed(seed);
  const animal = ANIMALS[(h >>> 6) % ANIMALS.length]!;
  const colour = COLOURS[(h >>> 12) % COLOURS.length]!;
  return { Icon: ICONS[animal.icon] ?? GiFox, ...palette(colour) };
}

export function Avatar({ seed, size = 40, className = "" }: { seed: string; size?: number; className?: string }) {
  const { Icon, icon, background, ring } = avatarStyle(seed);
  return (
    <div
      className={`inline-flex shrink-0 items-center justify-center rounded-full shadow-md ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: `0 0 0 ${Math.max(2, size * 0.06)}px ${ring}, 0 2px 6px rgb(0 0 0 / 0.35)`,
        background,
        color: icon,
      }}
      aria-hidden
    >
      <Icon size={size * 0.62} />
    </div>
  );
}
