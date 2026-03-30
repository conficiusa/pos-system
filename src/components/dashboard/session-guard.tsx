"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@/lib/auth-client";
import { useNetworkStatus } from "@/hooks/use-network-status";
import type { SidebarUser } from "@/components/dashboard/sidebar";
import { hydrateFromServer, flushSyncQueue } from "@/services/sync/idb";

const STAFF_ROLES = new Set(["staff", "admin", "super-admin"]);
const OFFLINE_SESSION_KEY = "pos-offline-session";
const OFFLINE_READY_ROUTES = ["/customers", "/new-order"];
const CACHED_RATE_KEY = "pos-cached-rate";

type SessionCtxValue = {
  sidebarUser: SidebarUser;
  userId: string;
  userRole: string | null;
};

const SessionCtx = createContext<SessionCtxValue | null>(null);

export function useSessionContext() {
  const ctx = useContext(SessionCtx);
  if (!ctx)
    throw new Error("useSessionContext must be used within SessionGuard");
  return ctx;
}

function FullScreenSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-pos-bg-secondary">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-pos-border-secondary border-t-pos-brand" />
        <p className="text-[13px] text-pos-text-secondary">Loading…</p>
      </div>
    </div>
  );
}

function getOfflineCachedSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Session;
    // Respect the server-issued expiry — don't grant indefinite offline access.
    const expiresAt = stored?.session?.expiresAt;
    if (expiresAt && new Date(expiresAt) < new Date()) {
      localStorage.removeItem(OFFLINE_SESSION_KEY);
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

function storeOfflineSession(session: Session | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(OFFLINE_SESSION_KEY);
    }
  } catch {}
}

function storeCachedRate(rate: number) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CACHED_RATE_KEY, String(rate));
  } catch {}
}

async function fetchCurrentSession(): Promise<Session | null> {
  const res = await fetch("/api/auth/get-session", {
    credentials: "include",
    cache: "no-store",
  });

  if (res.status === 401) return null;
  if (!res.ok) {
    throw new Error(`Failed to fetch session: ${res.status}`);
  }

  return (await res.json()) as Session | null;
}

function useOfflineFirstSession(isOnline: boolean) {
  const [sessionState, setSessionState] = useState<{
    ready: boolean;
    value: Session | null;
  }>({ ready: false, value: null });
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    setSessionState({ ready: true, value: getOfflineCachedSession() });
  }, []);

  useEffect(() => {
    if (!sessionState.ready || !isOnline) {
      setIsRefreshing(false);
      return;
    }

    let cancelled = false;
    setIsRefreshing(true);

    fetchCurrentSession()
      .then((liveSession) => {
        if (cancelled) return;
        setSessionState({ ready: true, value: liveSession });
        storeOfflineSession(liveSession);
      })
      .catch(() => {
        if (cancelled) return;
        setSessionState((current) =>
          current.value
            ? current
            : { ready: true, value: getOfflineCachedSession() },
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOnline, sessionState.ready]);

  return {
    data: sessionState.value,
    isPending: !sessionState.ready || (!sessionState.value && isRefreshing),
  };
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isOnline } = useNetworkStatus();
  const { data: effectiveSession, isPending } =
    useOfflineFirstSession(isOnline);
  const swRegisteredRef = useRef(false);

  const primaryRole =
    effectiveSession?.user.roles?.find((role) => STAFF_ROLES.has(role)) ?? null;
  const hasAccess = Boolean(primaryRole);

  useEffect(() => {
    if (isPending) return;
    if (!effectiveSession) {
      router.replace("/login");
      return;
    }
    if (!hasAccess) {
      router.replace("/pending");
    }
  }, [hasAccess, isPending, effectiveSession, router]);

  useEffect(() => {
    if (
      !hasAccess ||
      swRegisteredRef.current ||
      !("serviceWorker" in navigator)
    ) {
      return;
    }

    swRegisteredRef.current = true;
    navigator.serviceWorker.register("/sw.js").catch(console.warn);
  }, [hasAccess]);

  useEffect(() => {
    if (!hasAccess || !isOnline) return;

    let cancelled = false;

    (async () => {
      if ("serviceWorker" in navigator) {
        try {
          await navigator.serviceWorker.ready;
        } catch {}
      }

      if (cancelled) return;

      OFFLINE_READY_ROUTES.forEach((route) => {
        router.prefetch(route);
      });

      await Promise.allSettled([
        ...OFFLINE_READY_ROUTES.map((route) =>
          fetch(route, { credentials: "include" }).then(() => undefined),
        ),
        fetch("/api/settings/rate", { credentials: "include" })
          .then(async (res) => {
            if (!res.ok) return;
            const data = (await res.json()) as { rate?: number };
            if (typeof data.rate === "number") {
              storeCachedRate(data.rate);
            }
          })
          .catch(() => {}),
      ]);

      if (cancelled) return;

      try {
        await flushSyncQueue();
      } catch {}

      if (cancelled) return;

      try {
        await hydrateFromServer();
      } catch {}
    })();

    return () => {
      cancelled = true;
    };
  }, [hasAccess, isOnline, router]);

  if (isPending || !effectiveSession || !hasAccess) {
    return <FullScreenSpinner />;
  }

  const sidebarUser: SidebarUser = {
    name: effectiveSession.user.name ?? "User",
    role: primaryRole ?? "Staff",
    initials: (effectiveSession.user.name ?? "U")
      .split(" ")
      .map((p: string) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  };

  return (
    <SessionCtx.Provider
      value={{
        sidebarUser,
        userId: effectiveSession.user.id,
        userRole: primaryRole,
      }}
    >
      {children}
    </SessionCtx.Provider>
  );
}
