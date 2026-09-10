import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export type Crumb = { label: string; to?: string; params?: Record<string, string> };

/**
 * Trail back out of a nested page. The app header only carries the wordmark, which is not
 * obviously a way home, so every page below the top level says where it sits.
 */
export function Crumbs({ trail }: { trail: Crumb[] }) {
  const { t } = useTranslation();
  const items: Crumb[] = [{ label: t("nav.crumbHome"), to: "/" }, ...trail];
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-cream-100/60 sm:text-sm">
      {items.map((c, i) => {
        const last = i === items.length - 1;
        return (
          <span key={`${c.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-cream-100/30">/</span>}
            {last || !c.to ? (
              <span className="max-w-[16rem] truncate font-semibold text-cream-50" aria-current={last ? "page" : undefined}>
                {c.label}
              </span>
            ) : (
              <Link to={c.to} params={c.params as never} className="rounded px-1 py-0.5 hover:bg-white/10 hover:text-cream-50">
                {c.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
