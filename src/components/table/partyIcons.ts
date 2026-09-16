import type { IconType } from "react-icons";
import {
  LuArrowDown,
  LuArrowRight,
  LuBan,
  LuBookOpen,
  LuEye,
  LuFlag,
  LuFlame,
  LuFlipVertical2,
  LuGift,
  LuLayers,
  LuLock,
  LuMegaphone,
  LuRotateCw,
  LuShield,
  LuShuffle,
  LuSparkles,
  LuStore,
  LuWandSparkles,
  LuZap,
} from "react-icons/lu";
import type { Twist } from "@/engine";

/** One stable, recognizable mark per Party twist, shared by the table and the Rules page. */
export const PARTY_TWIST_ICONS: Record<Twist, IconType> = {
  desce: LuArrowDown,
  golden: LuSparkles,
  lastTrick: LuFlag,
  blankPays: LuGift,
  noTrump: LuBan,
  pass: LuArrowRight,
  lightning: LuZap,
  asDealt: LuLock,
  swap: LuShuffle,
  guardian: LuShield,
  freeForAll: LuFlame,
  wildRank: LuWandSparkles,
  carousel: LuRotateCw,
  market: LuStore,
  dummy: LuLayers,
  faceUp: LuEye,
  inverted: LuFlipVertical2,
  // These two are implemented but currently outside the draw pool.
  openHands: LuBookOpen,
  allIn: LuMegaphone,
};
