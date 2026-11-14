import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, clearSession, getSession, onUnauthorized, saveSession, type StoredSession } from "./queryClient";
import type { User } from "./types";

type AuthState = {
  session: StoredSession | null;
  user: User | null;
  userId: string | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  acceptSession: (user: User, token: string) => void;
  signOut: () => void;
  refreshUser: () => Promise<unknown>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [session, setSession] = useState<StoredSession | null>(() => getSession());

  const signOut = useCallback(() => {
    clearSession();
    setSession(null);
    qc.clear();
  }, [qc]);

  useEffect(() => onUnauthorized(signOut), [signOut]);

  const me = useQuery({
    queryKey: ["/api/users/me", session?.id],
    queryFn: () => api<User>("GET", "/api/users/me"),
    enabled: !!session,
    staleTime: 5 * 60_000,
  });

  const acceptSession = useCallback(
    (user: User, token: string) => {
      saveSession(user as any, token);
      qc.clear();
      qc.setQueryData(["/api/users/me", user.id], user);
      setSession(getSession());
    },
    [qc],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      // No timezone: the phone owns users.timezone (plan dates anchor on it).
      const data = await api<{ user: User; token: string }>("POST", "/api/auth/login", { email, password });
      if (!data?.token || !data?.user) throw new Error("Unexpected response from the server");
      acceptSession(data.user, data.token);
    },
    [acceptSession],
  );

  const value = useMemo<AuthState>(
    () => ({
      session,
      user: (me.data as User) ?? null,
      userId: session?.id ?? null,
      loading: !!session && me.isLoading,
      signIn,
      acceptSession,
      signOut,
      refreshUser: () => me.refetch(),
    }),
    [session, me.data, me.isLoading, signIn, acceptSession, signOut, me],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
