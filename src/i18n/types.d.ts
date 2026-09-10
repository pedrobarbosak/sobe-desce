import "i18next";
import type pt from "./pt.json";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: { translation: typeof pt };
  }
}
