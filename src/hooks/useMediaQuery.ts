import { useSyncExternalStore } from "react";

/** Whether a media query matches, kept current as the window changes. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** A landscape phone, or any window as short as one: the `short:` variant in CSS. */
export function useShortScreen(): boolean {
  return useMediaQuery("(max-height: 480px)");
}
