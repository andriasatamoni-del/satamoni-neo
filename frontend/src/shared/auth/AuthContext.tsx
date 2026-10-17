import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { apiRequest, getToken, setToken } from "../api/client";
import { can, type Role } from "./roles";
import type { Permission } from "./permissions";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  roles: Role[];
  branchId: string | null;
  isActive: boolean;
  permissions: Permission[];
}

interface LoginResponse {
  token: string;
  user: CurrentUser;
}

interface AuthContextValue {
  user: CurrentUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setIsLoading(false);
      return;
    }
    apiRequest<CurrentUser>("/auth/me")
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const { token, user: loggedInUser } = await apiRequest<LoginResponse>("/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setToken(token);
    setUser(loggedInUser);
  }

  function logout() {
    setToken(null);
    setUser(null);
  }

  return <AuthContext.Provider value={{ user, isLoading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth لازم يتنادى جوه AuthProvider");
  return ctx;
}

// اختصار لـcan(user, ...) بالمستخدم الحالي: const allowed = useCan(); allowed(PERMISSION.X, PERMISSION.Y)
export function useCan(): (...permissions: Permission[]) => boolean {
  const { user } = useAuth();
  return useCallback((...permissions: Permission[]) => can(user, ...permissions), [user]);
}
