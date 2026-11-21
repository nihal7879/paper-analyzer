import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { api, getToken, setToken, subscribeToken } from "@/lib/api";

interface AdminState {
  isAdmin: boolean;
  ready: boolean;
  login: (password: string) => Promise<void>;
  logout: () => void;
}

const AdminContext = createContext<AdminState | null>(null);
const SERVER_SNAPSHOT = "__server__";

function tokenIsValid(token: string | null): boolean {
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    return false;
  }
}

export function AdminProvider({ children }: { children: React.ReactNode }) {
  // Token lives in localStorage; the server render has no access to it, so "ready" is false until hydrated.
  const token = useSyncExternalStore(subscribeToken, () => getToken() ?? "", () => SERVER_SNAPSHOT);
  const ready = token !== SERVER_SNAPSHOT;
  const isAdmin = ready && tokenIsValid(token);

  const login = useCallback(async (password: string) => {
    const { token } = await api.login(password);
    setToken(token);
  }, []);

  const logout = useCallback(() => setToken(null), []);

  return <AdminContext.Provider value={{ isAdmin, ready, login, logout }}>{children}</AdminContext.Provider>;
}

export function useAdmin(): AdminState {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error("useAdmin must be used inside AdminProvider");
  return ctx;
}
