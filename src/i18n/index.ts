import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import pt from "./pt.json";
import en from "./en.json";

export type Locale = "pt" | "en";
const STORAGE_KEY = "sd.locale";

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "pt" || stored === "en") return stored;
  } catch {
    /* ignore */
  }
  return "pt";
}

void i18next.use(initReactI18next).init({
  resources: { "pt-PT": { translation: pt }, en: { translation: en } },
  lng: initialLocale() === "pt" ? "pt-PT" : "en",
  fallbackLng: "pt-PT",
  interpolation: { escapeValue: false },
});

export function setLocale(locale: Locale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  const language = locale === "pt" ? "pt-PT" : "en";
  void i18next.changeLanguage(language);
  document.documentElement.lang = language;
}

if (typeof document !== "undefined") document.documentElement.lang = i18next.language;

export default i18next;
