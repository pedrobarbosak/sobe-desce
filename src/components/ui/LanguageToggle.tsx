import { useTranslation } from "react-i18next";
import { setLocale, type Locale } from "@/i18n";

export function LanguageToggle() {
  const { i18n } = useTranslation();
  const current = (i18n.language.startsWith("en") ? "en" : "pt") as Locale;
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-white/20 text-xs font-semibold">
      {(["pt", "en"] as Locale[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLocale(l)}
          className={`px-2.5 py-1 uppercase transition ${current === l ? "bg-cream-100 text-ink-900" : "text-cream-100/80 hover:bg-white/10"}`}
          aria-pressed={current === l}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
