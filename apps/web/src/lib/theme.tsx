import { createContext, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { withFade } from "@/lib/preferences";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "pa.theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const mq = media();
  mq.addEventListener("change", listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    mq.removeEventListener("change", listener);
    window.removeEventListener("storage", listener);
  };
}

/** "theme|resolved" so one snapshot covers both the choice and the system preference. */
function snapshot(): string {
  const theme = readTheme();
  const resolved = theme === "system" ? (media().matches ? "dark" : "light") : theme;
  return `${theme}|${resolved}`;
}

interface ThemeState {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, resolvedTheme] = useSyncExternalStore(subscribe, snapshot).split("|") as [Theme, "light" | "dark"];

  // index.html applies the class before first paint; this keeps it in sync afterwards.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [resolvedTheme]);

  const setTheme = useCallback((next: Theme) => {
    // Cross-fade light <-> dark instead of flashing (where the browser supports it).
    withFade(() => {
      try {
        if (next === "system") localStorage.removeItem(STORAGE_KEY);
        else localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // storage blocked: theme just won't persist
      }
      const dark = next === "dark" || (next === "system" && media().matches);
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
      listeners.forEach((l) => l());
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
