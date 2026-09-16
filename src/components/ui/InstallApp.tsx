import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LuSmartphone } from "react-icons/lu";
import { APK_PATH, apkUrl, isAndroidBrowser } from "@/lib/native";
import { Panel } from "./Panel";

const DISMISSED_KEY = "sd.install-dismissed";

/**
 * The site, opened in a browser on an Android phone, offers the app. Only when there is
 * one to offer: the APK is checked for before anything is shown, so a deployment that
 * has not published one shows nothing. Dismissing it is remembered on the device.
 */
export function InstallAppBanner() {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isAndroidBrowser) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY)) return;
    } catch {
      /* private mode: offer it every time */
    }
    const target = apkUrl();
    let live = true;
    // A link off the site (a release page) cannot be probed from here; trust it.
    if (target !== APK_PATH) {
      setUrl(target);
      return;
    }
    fetch(target, { method: "HEAD" })
      .then((res) => {
        if (live && res.ok) setUrl(target);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  if (!url) return null;
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      /* ignore */
    }
    setUrl(null);
  };
  return (
    <Panel className="mb-4 flex flex-col gap-3 border-gold-400/40 sm:flex-row sm:items-center">
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg font-bold text-cream-50">
          <LuSmartphone className="icon" /> {t("install.title")}
        </p>
        <p className="mt-0.5 text-xs text-cream-100/70">{t("install.hint")}</p>
      </div>
      <div className="flex gap-2">
        <a
          href={url}
          download
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brass-500 px-4 py-2.5 text-sm font-semibold text-ink-900 shadow-[0_3px_0_0_var(--color-brass-700)] transition hover:bg-brass-400 active:translate-y-[2px] active:shadow-none"
        >
          {t("install.button")}
        </a>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-lg border border-current/30 px-3 py-2.5 text-sm font-semibold text-cream-100/80 hover:bg-white/10"
        >
          {t("install.dismiss")}
        </button>
      </div>
    </Panel>
  );
}
