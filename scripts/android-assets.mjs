// Draws the source images the Android launcher icon and splash are generated from, then
// hands them to @capacitor/assets, which writes every density into android/app/src/main/res.
// Run `npm run android:assets` after changing the artwork and commit the result.
//
// The artwork is the same spade as public/icon-512.png, drawn as vectors here so the
// adaptive icon's foreground (which Android masks and moves) and the splash can be
// rendered at any size without upscaling a bitmap.
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import console from "node:console";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets");
mkdirSync(out, { recursive: true });

const FELT = "#1b5e3b";
const FELT_DARK = "#0f3d27";
const CREAM = "#f7ecd2";

/** The spade in a 100×100 box: a heart turned over, and a flared stem out of the notch. */
const SPADE_PATH =
  "M50 6 C40 20 12 38 12 60 C12 74 22 84 34 84 C41 84 46 81 50 76 C54 81 59 84 66 84 C78 84 88 74 88 60 C88 38 60 20 50 6 Z " +
  "M50 72 C49 82 45 90 36 96 L64 96 C55 90 51 82 50 72 Z";

/** The spade centred in a square canvas, at `scale` of its side, on `background` (or none). */
function spadeSvg(side, scale, background) {
  const size = side * scale;
  const offset = (side - size) / 2;
  const bg = background ? `<rect width="${side}" height="${side}" fill="${background}"/>` : "";
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}">` +
      bg +
      `<g transform="translate(${offset} ${offset}) scale(${size / 100})"><path d="${SPADE_PATH}" fill="${CREAM}"/></g>` +
      `</svg>`,
  );
}

const files = [
  // The legacy icon: what Android before 8 shows, and what the store listing uses.
  ["icon-only.png", spadeSvg(1024, 0.62, FELT)],
  // Adaptive icon layers. The foreground must keep its content inside the middle 66%,
  // because launchers mask the outer ring away and shift the layers for parallax.
  ["icon-foreground.png", spadeSvg(1024, 0.5, null)],
  ["icon-background.png", spadeSvg(1024, 0, FELT)],
  // The splash behind the system's own icon splash on Android 12+, and the whole splash
  // before that. Sized for the largest tablet, as the tool requires.
  ["splash.png", spadeSvg(2732, 0.16, FELT_DARK)],
  ["splash-dark.png", spadeSvg(2732, 0.16, FELT_DARK)],
];

for (const [name, svg] of files) {
  await sharp(svg).png().toFile(join(out, name));
  console.log(`drew assets/${name}`);
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["@capacitor/assets", "generate", "--android", "--iconBackgroundColor", FELT, "--iconBackgroundColorDark", FELT, "--splashBackgroundColor", FELT_DARK, "--splashBackgroundColorDark", FELT_DARK],
  { cwd: root, stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(result.status ?? 1);
