"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import type { SidebarUser } from "@/components/dashboard/sidebar";
import { hydrateFromServer, flushSyncQueue } from "@/services/sync/idb";

const STAFF_ROLES = new Set(["staff", "admin", "super-admin"]);
const OFFLINE_SESSION_KEY = "pos-offline-session";

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

// Read a cached session from localStorage — used as an offline fallback only.
// Called only when the network session fetch has already completed and returned
// null, so we always attempt the fallback regardless of navigator.onLine
// (which is unreliable and can report "online" when there is no connectivity).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getOfflineCachedSession(): any {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw);
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

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [rolesChecked, setRolesChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [primaryRole, setPrimaryRole] = useState<string | null>(null);
  const bootedRef = useRef(false);

  // Persist session to localStorage whenever it is available so it can be
  // used as a fallback when the device is offline.
  useEffect(() => {
    if (session) {
      try {
        localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(session));
      } catch {}
    }
  }, [session]);

  // Derive effective session: prefer the live network session; fall back to
  // the localStorage copy only when the network fetch has finished and failed.
  const offlineFallback = !isPending && !session ? getOfflineCachedSession() : null;
  const effectiveSession = session ?? offlineFallback;

  useEffect(() => {
    if (isPending) return;
    if (!effectiveSession) {
      router.replace("/login");
    }
  }, [isPending, effectiveSession, router]);

  useEffect(() => {
    if (!effectiveSession) return;
    const roles = (effectiveSession.user.roles ?? []) as string[];
    const granted = roles.find((r: string) => STAFF_ROLES.has(r)) ?? null;
    if (granted) {
      setPrimaryRole(granted);
      setHasAccess(true);
    } else {
      router.replace("/pending");
    }
    setRolesChecked(true);
  }, [effectiveSession, router]);

  useEffect(() => {
    if (!hasAccess || bootedRef.current) return;
    bootedRef.current = true;

    // Register service worker.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.warn);
    }

    // Boot sequence: flush any queued offline mutations first (they take
    // priority — user data must reach the server), then hydrate IDB with
    // the latest server state. Hydration dispatches HYDRATION_COMPLETE_EVENT
    // when done, which React Query hooks can listen to for cache invalidation.
    (async () => {
      try {
        await flushSyncQueue();
      } catch {}
      try {
        await hydrateFromServer();
      } catch {}
    })();
  }, [hasAccess]);

  if (isPending || !effectiveSession || !rolesChecked || !hasAccess) {
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
      value={{ sidebarUser, userId: effectiveSession.user.id, userRole: primaryRole }}
    >
      {children}
    </SessionCtx.Provider>
  );
}
