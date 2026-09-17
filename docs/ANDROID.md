# The Android app

The app is the web build in a native shell ([Capacitor](https://capacitorjs.com)). There is
one codebase: everything under `src/` runs identically on the site and in the app, and the
handful of things that differ (where sign-in returns to, what an invite link says, the
back button) live in `src/lib/native.ts` and are no-ops in a browser. iOS later is
`npx cap add ios` against the same code.

The native project is committed under `android/`. What it wraps, the built `dist/`, is not:
`npx cap sync android` copies it in.

## Prerequisites

- Android Studio, for its SDK and its bundled JDK. Nothing else needs installing: the
  build script finds both in Android Studio's default locations, or honours `ANDROID_HOME`
  and `JAVA_HOME` if set.
- Node 24, as for the site.

## Which deployment the app talks to

The Convex origins and the site's public address are compiled into the bundle, exactly as
for the site. They come from `.env.android` (gitignored; never commit it):

```bash
VITE_CONVEX_URL=https://sobe-desce-api.example.com
VITE_CONVEX_SITE_URL=https://sobe-desce-actions.example.com
VITE_APP_URL=https://sobe-desce.example.com
```

`VITE_APP_URL` matters more in the app than on the site: inside the shell the page's own
origin is the web view's, so this is what an invite link says and which links open the
app.

To point a build at a workstation backend from the emulator, use the emulator's alias for
the host's loopback: `VITE_CONVEX_URL=http://10.0.2.2:3212`, `VITE_CONVEX_SITE_URL=http://10.0.2.2:3213`.
Debug builds allow plain http for exactly this; release builds do not.

## Building

```bash
npm run android              # debug APK: android/app/build/outputs/apk/debug/app-debug.apk
npm run android release      # signed .aab for the Play Store
npm run android apk-release  # signed APK, for handing out directly
```

Each run rebuilds the web bundle, syncs it into the native project and runs Gradle. To
open the project in Android Studio instead (for the emulator, the profiler, or the WebView
inspector at `chrome://inspect`), run `npm run android:open` after a sync.

Install a debug build on a phone with USB debugging on, or on a running emulator:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### Live reload

For iterating on the page itself, the shell can load a running Vite dev server instead of
the bundled site. `npm run dev` binds to every interface; use the workstation's LAN
address (or `10.0.2.2` from the emulator):

```bash
CAP_SERVER_URL=http://192.168.1.10:5173 npx cap sync android
cd android && ./gradlew installDebug
```

Sync again without the variable before building anything to hand out, or the app will try
to reach your workstation.

## Offering the app from the site

The site, opened in a browser on an Android phone, shows an "Install APK" banner when it
has an app to offer. It offers the file at `/app/sobe-desce.apk`, which
`npm run android apk-release` copies into `public/app/`. Commit that file and deploy:
it ships inside the site image like any other static file, and the banner appears only
once the file is actually there (the page checks before showing anything). Phones need
to allow installs from the browser the first time; Android asks by itself.

To host the file elsewhere instead (a release page, say), build the site with
`VITE_APK_URL` set to that address and skip the copy.

## Signing a release

Once, make a keystore and keep it somewhere safe. Losing it means never updating the app
on the store again.

```bash
keytool -genkeypair -v -keystore sobe-desce.jks -alias sobe-desce -keyalg RSA -keysize 2048 -validity 10000
```

Then `android/keystore.properties` (gitignored), with paths relative to `android/`:

```
storeFile=../sobe-desce.jks
storePassword=...
keyAlias=sobe-desce
keyPassword=...
```

The store needs the version code to climb on every upload:

```bash
ANDROID_VERSION_CODE=2 npm run android release
```

The version name shown to people follows `version` in `package.json`.

## Links that open the app

Two kinds of link land in the app rather than in a browser tab:

- **The app's own scheme, `sobedesce://`.** A sign-in started in the app (Discord,
  Microsoft, or a magic link) opens the provider in the system browser and comes back on
  this scheme with a one-time token, which the app trades for the session. This needs no
  setup: the scheme is registered in the manifest and trusted by `convex/auth.ts`. A magic
  link requested from the app therefore only works when opened on the phone that has the
  app; opened on a desktop, the browser has nothing to hand it to.
- **Links to the site**, `https://<site>/join/…`, `/g/…` and `/account`. Android opens
  these in the app only after verifying that the site vouches for it, through
  `https://<site>/.well-known/assetlinks.json`. `deploy.sh` writes that file when
  `ANDROID_CERT_SHA256` is set in `.env.deploy`: the SHA-256 fingerprint of the signing
  certificate, colon separated, as printed by

  ```bash
  keytool -list -v -keystore sobe-desce.jks -alias sobe-desce | grep SHA256
  ```

  Until it is set, or on a debug build (signed with a different key), the links open the
  site in the browser instead, which still works; the app is just not involved.

Inside the app, the page's own origin is `https://localhost`, which is why
`convex/auth.ts` lists it (and iOS's `capacitor://localhost`) among the trusted origins.

## What the shell adds

- Landscape only, either way round (set in the manifest, on the activity). A card table
  is wide: upright, a phone cuts seats and panels off the felt, and the smaller the phone
  the worse it gets. The site follows suit on any window that short: a `short:` Tailwind
  variant (`max-height: 480px`, in `src/index.css`) and `useShortScreen()` fold the
  chrome away, the felt itself has a short tier in `useFeltLayout` (the status moves into
  the bar, everything else into the `⋯` menu), and pages use the width instead.
- Full screen. On its side a phone has little height to spare, and the status bar and the
  gesture strip would take a sixth of it, so `MainActivity` hides both; a swipe from the
  edge shows them for a moment. The page still keeps its edges clear of any cutout
  (`.safe-top`, `.safe-bottom` and `.safe-x` in `src/index.css`). Nothing may push the
  page wider than the screen: a phone browser answers horizontal overflow by scaling the
  whole layout viewport, and every full-screen surface then runs off the bottom.
- The back button closes an open drawer, otherwise goes back a page, and at the home page
  sends the app to the background rather than killing it, so the live connection is warm
  when it comes back.
- A buzz when it is your turn and when you take a trick; the screen stays on while a game
  is live; the invite has a share button that opens the system share sheet.
- The fonts ship in the bundle, so the first screen never waits on a font server.

## Icon and splash

`npm run android:assets` draws the launcher icon (the spade on the felt, as an adaptive
icon) and the splash from vectors in `scripts/android-assets.mjs` and writes every density
into `android/app/src/main/res`. Run it after changing the artwork and commit the result.

## Package name

The app id is `com.sobedesce.app`. It can be changed freely until the first store
upload, after which it is permanent. It appears in `capacitor.config.ts`,
`android/app/build.gradle`, `android/app/src/main/res/values/strings.xml`, the Java
package under `android/app/src/main/java`, and `scripts/deploy.sh` (the assetlinks file).
