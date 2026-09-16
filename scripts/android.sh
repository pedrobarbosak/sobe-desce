#!/usr/bin/env bash
# Build the Android app: the web bundle pointed at a deployment, synced into the native
# project, then compiled by Gradle. Safe to re-run.
#
#   scripts/android.sh              debug APK, for a phone or emulator over adb
#   scripts/android.sh release      signed release bundle (.aab) for the Play Store
#   scripts/android.sh apk-release  signed release APK, for handing out directly
#
# The deployment the app talks to comes from .env.android (see docs/ANDROID.md):
#   VITE_CONVEX_URL, VITE_CONVEX_SITE_URL, VITE_APP_URL
# Release builds also need android/keystore.properties, and ANDROID_VERSION_CODE has to
# climb on every store upload.
set -euo pipefail
cd "$(dirname "$0")/.."

kind=${1:-debug}
if [ -f .env.android ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.android
  set +a
fi
: "${VITE_CONVEX_URL:?set it in .env.android (see docs/ANDROID.md)}"
: "${VITE_CONVEX_SITE_URL:?set it in .env.android (see docs/ANDROID.md)}"
: "${VITE_APP_URL:?set it in .env.android (see docs/ANDROID.md)}"
export VITE_CONVEX_URL VITE_CONVEX_SITE_URL VITE_APP_URL
# The bare hostname, for the manifest: which links open the app.
APP_HOST=${VITE_APP_URL#http://}
APP_HOST=${APP_HOST#https://}
export APP_HOST=${APP_HOST%%/*}

# Toolchain: Android Studio's own JDK and SDK unless told otherwise.
if [ -z "${JAVA_HOME:-}" ]; then
  for d in "${LOCALAPPDATA:-}/Programs/Android Studio/jbr" "/c/Program Files/Android/Android Studio/jbr" \
           "/Applications/Android Studio.app/Contents/jbr/Contents/Home" "$HOME/android-studio/jbr" "/opt/android-studio/jbr"; do
    if [ -d "$d" ]; then export JAVA_HOME=$d; break; fi
  done
fi
if [ -z "${ANDROID_HOME:-}" ]; then
  for d in "${LOCALAPPDATA:-}/Android/Sdk" "$HOME/Library/Android/sdk" "$HOME/Android/Sdk"; do
    if [ -d "$d" ]; then export ANDROID_HOME=$d; break; fi
  done
fi
: "${JAVA_HOME:?no JDK found: install Android Studio or set JAVA_HOME}"
: "${ANDROID_HOME:?no Android SDK found: install Android Studio or set ANDROID_HOME}"

case $kind in
  debug) task=assembleDebug; out=android/app/build/outputs/apk/debug/app-debug.apk ;;
  release) task=bundleRelease; out=android/app/build/outputs/bundle/release/app-release.aab ;;
  apk-release) task=assembleRelease; out=android/app/build/outputs/apk/release/app-release.apk ;;
  *) echo "unknown build: $kind (debug, release, apk-release)" >&2; exit 1 ;;
esac
if [ "$kind" != debug ] && [ ! -f android/keystore.properties ]; then
  echo "android/keystore.properties is missing; a release build has to be signed (see docs/ANDROID.md)" >&2
  exit 1
fi

echo "==> web bundle for $VITE_APP_URL"
npm run build
echo "==> native project"
npx cap sync android
echo "==> gradle $task"
(cd android && ./gradlew "$task" -q)
echo
echo "Built $out"

# The site offers the app to Android phones from /app/sobe-desce.apk. The file ships
# with the site, so a release APK lands in public/ to be committed and deployed.
if [ "$kind" = apk-release ]; then
  mkdir -p public/app
  cp "$out" public/app/sobe-desce.apk
  echo "Copied to public/app/sobe-desce.apk: commit it and deploy, and the site will offer it."
fi
