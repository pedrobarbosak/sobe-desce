// Render scripts/og-image.html to public/og-image.jpg, the picture a shared link unfurls
// with. Run `npm run og-image` after changing the HTML and commit the image.
//
// Needs Chrome or Edge (set CHROME to its path if it is somewhere unusual). The page pulls
// its fonts from Google, so it also needs the network.
import { spawnSync } from "node:child_process";
import console from "node:console";
import process from "node:process";
import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "scripts", "og-image.html");
const out = join(root, "public", "og-image.jpg");

const candidates = {
  win32: [
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Google\\Chrome\\Application\\chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Google\\Chrome\\Application\\chrome.exe"),
    join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
    join(process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)", "Microsoft\\Edge\\Application\\msedge.exe"),
    join(process.env.PROGRAMFILES ?? "C:\\Program Files", "Microsoft\\Edge\\Application\\msedge.exe"),
  ],
  darwin: [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ],
  linux: ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"],
};

const browser = process.env.CHROME ?? (candidates[process.platform] ?? candidates.linux).find((p) => existsSync(p));
if (!browser) {
  console.error("No Chrome or Edge found. Set CHROME to the browser's path and try again.");
  process.exit(1);
}

const before = existsSync(out) ? statSync(out).mtimeMs : 0;
// The virtual time budget gives the web fonts time to load before the shot is taken.
// The extension on --screenshot picks the format.
const result = spawnSync(
  browser,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1200,630",
    "--virtual-time-budget=5000",
    `--screenshot=${out}`,
    pathToFileURL(src).href,
  ],
  { encoding: "utf8" },
);

// Chrome reports success on stderr and can exit 0 without writing, so trust the file.
if (!existsSync(out) || statSync(out).mtimeMs === before) {
  console.error(result.stderr || result.error?.message || "The browser did not write the image.");
  process.exit(1);
}
console.log(`Wrote public/og-image.jpg (${Math.round(statSync(out).size / 1024)} KB)`);
