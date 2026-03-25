import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type ThemePreference = "light" | "dark" | "system";

const STORAGE_KEY = "wunschplan.theme";

function getSystemDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveDark(preference: ThemePreference): boolean {
  if (preference ***REMOVED*** "dark") return true;
  if (preference ***REMOVED*** "light") return false;
  return getSystemDark();
}

function readStoredPreference(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw ***REMOVED*** "light" || raw ***REMOVED*** "dark" || raw ***REMOVED*** "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

function applyDarkClass(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

interface ThemeContextValue {
  preference: ThemePreference;
  setPreference: (p: ThemePreference) ***REMOVED*** void;
  /** Effektiv hell/dunkel (bei „system“ = OS) */
  resolvedDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() ***REMOVED***
    typeof window ***REMOVED*** "undefined" ? "system" : readStoredPreference(),
  );

  const resolvedDark = useMemo(() ***REMOVED*** resolveDark(preference), [preference]);

  const setPreference = useCallback((p: ThemePreference) ***REMOVED*** {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // ignore
    }
    applyDarkClass(resolveDark(p));
  }, []);

  useEffect(() ***REMOVED*** {
    applyDarkClass(resolvedDark);
  }, [resolvedDark]);

  useEffect(() ***REMOVED*** {
    if (preference !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () ***REMOVED*** applyDarkClass(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () ***REMOVED*** mq.removeEventListener("change", sync);
  }, [preference]);

  const value = useMemo(
    () ***REMOVED*** ({ preference, setPreference, resolvedDark }),
    [preference, setPreference, resolvedDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
