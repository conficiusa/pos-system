"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import type { SidebarUser } from "@/components/dashboard/sidebar";
import { hydrateFromServer, flushSyncQueue } from "@/services/sync/idb";

const STAFF_ROLES = new Set(["staff", "admin", "super-admin"]);
const ROLE_CACHE_KEY = "goldpos_role";

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--pos-bg-secondary)]">
      <div className="flex flex-col items-center gap-3">
        <div className="size-8 animate-spin rounded-full border-2 border-[var(--pos-border-secondary)] border-t-[var(--pos-brand)]" />
        <p className="text-[13px] text-[var(--pos-text-secondary)]">Loading…</p>
      </div>
    </div>
  );
}

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: session, isPending } = useSession();
  const [rolesChecked, setRolesChecked] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);
  const [primaryRole, setPrimaryRole] = useState<string | null>(null);
  const bootedRef = useRef(false);

  useEffect(() => {
    if (!isPending && !session) {
      router.replace("/login");
    }
  }, [isPending, session, router]);

  useEffect(() => {
    if (!session) return;
    const cacheKey = `${ROLE_CACHE_KEY}_${session.user.id}`;
    fetch("/api/me/roles")
      .then((r) => r.json())
      .then((data) => {
        const { roles } = data as { roles: string[] };
        const granted = roles.find((r) => STAFF_ROLES.has(r)) ?? null;
        if (granted) {
          sessionStorage.setItem(cacheKey, granted);
          setPrimaryRole(granted);
          setHasAccess(true);
        } else {
          sessionStorage.removeItem(cacheKey);
          router.replace("/pending");
        }
      })
      .catch(() => {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          setPrimaryRole(cached);
          setHasAccess(true);
        } else {
          router.replace("/pending");
        }
      })
      .finally(() => setRolesChecked(true));
  }, [session, router]);

  useEffect(() => {
    if (!hasAccess || bootedRef.current) return;
    bootedRef.current = true;

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(console.warn);
    }

    (async () => {
      try { await flushSyncQueue(); } catch {}
      try { await hydrateFromServer(); } catch {}
    })();
  }, [hasAccess]);

  if (isPending || !session || !rolesChecked || !hasAccess) {
    return <FullScreenSpinner />;
  }

  const sidebarUser: SidebarUser = {
    name: session.user.name ?? "User",
    role: primaryRole ?? "Staff",
    initials: (session.user.name ?? "U")
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase(),
  };

  const userRole = primaryRole;

  return (
    <SessionCtx.Provider
      value={{ sidebarUser, userId: session.user.id, userRole }}
    >
      {children}
    </SessionCtx.Provider>
  );
}
