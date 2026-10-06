import { useSyncExternalStore } from "react";

/**
 * Student preferences chosen in Settings (⚙), remembered on this device.
 */
function createPref<T extends string>(key: string, allowed: readonly T[], fallback: T, apply?: (v: T) => void) {
  const listeners = new Set<() => void>();
  const read = (): T => {
    try {
      const v = localStorage.getItem(key) as T | null;
      return v && allowed.includes(v) ? v : fallback;
    } catch {
      return fallback;
    }
  };
  let value = read();
  apply?.(value);
  const set = (v: T) => {
    if (v === value) return;
    value = v;
    try {
      localStorage.setItem(key, v);
    } catch {
      // private mode: works for this visit only
    }
    apply?.(v);
    for (const l of listeners) l();
  };
  const use = () =>
    useSyncExternalStore(
      (l) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      () => value,
    );
  return { set, use };
}

/** Change the page's look with a short cross-fade where the browser supports it. */
export function withFade(change: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) doc.startViewTransition(change);
  else change();
}

/** "All" questions in a list (default), or "One at a time". */
export type ViewMode = "list" | "single";
const view = createPref<ViewMode>("pa.view", ["list", "single"], "list");
export const useViewMode = view.use;
export const setViewMode = view.set;

/** Where "Similar questions" open: their own page (default), a pop-up window, or inside the card. */
export type SimilarMode = "page" | "modal" | "inline";
const similar = createPref<SimilarMode>("pa.similar", ["page", "modal", "inline"], "page");
export const useSimilarMode = similar.use;
export const setSimilarMode = similar.set;

/** Colour theme: teal (default) or the earlier blue. index.html sets it before first paint too. */
export type ColorTheme = "teal" | "blue";
const color = createPref<ColorTheme>("pa.color", ["teal", "blue"], "teal", (v) => {
  document.documentElement.dataset.color = v;
});
export const useColorTheme = color.use;
export const setColorTheme = (v: ColorTheme) => withFade(() => color.set(v));
