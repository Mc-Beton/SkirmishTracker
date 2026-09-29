"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { disablePush, syncPush } from "@/lib/push";
import { api, type Me } from "@/lib/api";
import { resetLiveConnection } from "@/lib/live";
import { clearOfflineUserData } from "@/components/pwa/service-worker";

type AuthState = {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMe(await api<Me>("GET", "/api/me"));
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
      // The live stream carries the session's notifications: reopen it for the new session.
      resetLiveConnection();
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await disablePush().catch(() => undefined);
      await api("POST", "/api/auth/logout");
    } finally {
      setMe(null);
      clearOfflineUserData();
      resetLiveConnection();
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<Me>("GET", "/api/me")
      .then((user) => active && setMe(user))
      .catch(() => active && setMe(null))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  // A device subscribed to push keeps delivering to whoever is signed in on it now.
  const userId = me?.id;
  useEffect(() => {
    if (userId) void syncPush();
  }, [userId]);

  return <AuthContext.Provider value={{ me, loading, reload, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
