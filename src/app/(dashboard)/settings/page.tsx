"use client"

import { useEffect, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { DashboardShell } from "@/components/dashboard/dashboard-shell"
import { Topbar } from "@/components/dashboard/topbar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { apiFetch } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { useSessionContext } from "@/components/dashboard/session-guard"
import { RequiresNetwork } from "@/components/dashboard/requires-network"
import { ConfirmPasswordDialog } from "@/components/dashboard/confirm-password-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { GrantableRole } from "@/services/access/access.service"

type AppUser = {
  id: string
  name: string
  email: string
  role: string | null
  createdAt: number
  banned: boolean | null
  phone: string | null
  grantedRoles: string[]
}

type RateData = {
  rate: number
  updatedAt: string | null
  updatedBy: string | null
}

const GRANTABLE_ROLES: GrantableRole[] = ["admin", "staff"]

const roleLabel: Record<string, string> = {
  "super-admin": "Super Admin",
  admin: "Admin",
  staff: "Staff",
  user: "User",
}

const roleBadgeClass: Record<string, string> = {
  "super-admin": "bg-pos-brand-soft text-pos-brand-ink",
  admin: "bg-pos-brand-soft text-pos-brand-ink",
  staff: "bg-pos-purple-soft text-pos-purple",
}

const avatarPalette = [
  { bg: "var(--pos-brand-soft)", text: "var(--pos-brand-ink)" },
  { bg: "var(--pos-purple-soft)", text: "var(--pos-purple)" },
  { bg: "var(--pos-warning-soft)", text: "var(--pos-warning)" },
  { bg: "var(--pos-orange-soft)", text: "var(--pos-orange)" },
  { bg: "var(--pos-info-soft)", text: "var(--pos-info)" },
]

function avatarColor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return avatarPalette[hash % avatarPalette.length]
}

function initials(name: string) {
  return name.split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase()
}

function RoleBadge({ role }: { role: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium",
        roleBadgeClass[role] ?? "bg-pos-bg-secondary text-pos-text-secondary",
      )}
    >
      {roleLabel[role] ?? role}
    </span>
  )
}

const SkeletonUserCard = () => (
  <div className="flex items-center gap-4 rounded-lg border border-pos-border-tertiary bg-pos-bg-primary p-4">
    <span className="size-10 animate-pulse rounded-full bg-pos-bg-secondary" />
    <div className="flex-1 space-y-1.5">
      <span className="block h-3.5 w-36 animate-pulse rounded bg-pos-bg-secondary" />
      <span className="block h-3 w-52 animate-pulse rounded bg-pos-bg-secondary" />
    </div>
    <span className="h-5 w-14 animate-pulse rounded-full bg-pos-bg-secondary" />
    <span className="h-7 w-20 animate-pulse rounded-md bg-pos-bg-secondary" />
  </div>
)

type PendingDelete = { userId: string; userName: string }
type PendingRoleChange =
  | { type: "grant"; userId: string; userName: string; role: GrantableRole }
  | { type: "revoke"; userId: string; userName: string; role: GrantableRole }

type ManageRolesTarget = { user: AppUser }

export default function SettingsPage() {
  const { sidebarUser } = useSessionContext()
  const queryClient = useQueryClient()

  // Rate
  const [rateInput, setRateInput] = useState("")
  const [isSavingRate, setIsSavingRate] = useState(false)
  const [rateError, setRateError] = useState<string | null>(null)
  const [rateSaved, setRateSaved] = useState(false)

  // Create user
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState("")
  const [createEmail, setCreateEmail] = useState("")
  const [createPassword, setCreatePassword] = useState("")
  const [createPhone, setCreatePhone] = useState("")
  const [isCreating, setIsCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  // Manage roles dialog
  const [manageTarget, setManageTarget] = useState<ManageRolesTarget | null>(null)
  const [grantRoleValue, setGrantRoleValue] = useState<GrantableRole>("staff")
  const [isGrantingRole, setIsGrantingRole] = useState(false)

  // Confirmations
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null)
  const [pendingRoleChange, setPendingRoleChange] = useState<PendingRoleChange | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isChangingRole, setIsChangingRole] = useState(false)

  const rateQuery = useQuery({
    queryKey: ["settings-rate"],
    queryFn: () => apiFetch("/api/settings/rate").then((r) => r.json() as Promise<RateData>),
  })

  useEffect(() => {
    if (rateQuery.data && !rateInput) setRateInput(String(rateQuery.data.rate))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateQuery.data])

  const usersQuery = useQuery({
    queryKey: ["settings-users"],
    queryFn: () =>
      apiFetch("/api/settings/users").then(
        (r) => r.json() as Promise<{ data?: AppUser[]; error?: string }>,
      ),
    retry: 1,
  })

  const users = usersQuery.data?.data ?? []
  const isForbidden = usersQuery.data?.error === "Forbidden" || usersQuery.isError

  // ─── Actions ────────────────────────────────────────────────────────────────

  const handleSaveRate = async (e: React.FormEvent) => {
    e.preventDefault()
    setRateError(null)
    setRateSaved(false)
    const value = parseFloat(rateInput)
    if (isNaN(value) || value <= 0) { setRateError("Enter a valid positive number"); return }
    setIsSavingRate(true)
    try {
      const res = await apiFetch("/api/settings/rate", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rate: value }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setRateError(data.error ?? "Failed to save rate"); return }
      void queryClient.invalidateQueries({ queryKey: ["settings-rate"] })
      void queryClient.invalidateQueries({ queryKey: ["current-rate"] })
      setRateSaved(true)
      setTimeout(() => setRateSaved(false), 2500)
    } catch {
      setRateError("Something went wrong")
    } finally {
      setIsSavingRate(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreateError(null)
    setIsCreating(true)
    try {
      const res = await apiFetch("/api/settings/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName,
          email: createEmail,
          password: createPassword,
          phone: createPhone || undefined,
        }),
      })
      const data = await res.json() as { error?: string }
      if (!res.ok) { setCreateError(data.error ?? "Failed to create user"); return }
      setShowCreate(false)
      setCreateName(""); setCreateEmail(""); setCreatePassword(""); setCreatePhone("")
      void queryClient.invalidateQueries({ queryKey: ["settings-users"] })
    } catch {
      setCreateError("Something went wrong")
    } finally {
      setIsCreating(false)
    }
  }

  const confirmDelete = async () => {
    if (!pendingDelete) return
    setIsDeleting(true)
    try {
      await apiFetch(`/api/settings/users/${pendingDelete.userId}`, { method: "DELETE" })
      void queryClient.invalidateQueries({ queryKey: ["settings-users"] })
    } finally {
      setIsDeleting(false)
      setPendingDelete(null)
    }
  }

  const confirmRoleChange = async () => {
    if (!pendingRoleChange) return
    setIsChangingRole(true)
    try {
      if (pendingRoleChange.type === "grant") {
        setIsGrantingRole(true)
        await apiFetch(`/api/settings/users/${pendingRoleChange.userId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: pendingRoleChange.role }),
        })
      } else {
        await apiFetch(
          `/api/settings/users/${pendingRoleChange.userId}/roles/${pendingRoleChange.role}`,
          { method: "DELETE" },
        )
      }
      void queryClient.invalidateQueries({ queryKey: ["settings-users"] })
      // Refresh manage dialog target data
      if (manageTarget) {
        const freshUsers = await apiFetch("/api/settings/users").then(
          (r) => r.json() as Promise<{ data?: AppUser[] }>,
        )
        const updated = freshUsers.data?.find((u) => u.id === manageTarget.user.id)
        if (updated) setManageTarget({ user: updated })
      }
    } finally {
      setIsChangingRole(false)
      setIsGrantingRole(false)
      setPendingRoleChange(null)
    }
  }

  // ─── Access denied ───────────────────────────────────────────────────────────

  if (isForbidden) {
    return (
      <DashboardShell activeItem="settings" user={sidebarUser}>
        <Topbar title="Settings" />
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24">
          <p className="text-[14px] font-medium text-pos-text-primary">Access denied</p>
          <p className="text-[13px] text-pos-text-secondary">
            You need admin privileges to view settings.
          </p>
        </div>
      </DashboardShell>
    )
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardShell activeItem="settings" user={sidebarUser}>
      <RequiresNetwork>
      <Topbar title="Settings" subtitle="Manage rates, users, and roles" />

      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        <Tabs defaultValue="general">
          <TabsList className="mb-6 h-9 rounded-md border border-pos-border-tertiary bg-pos-bg-secondary p-0.5">
            <TabsTrigger
              value="general"
              className="h-8 rounded px-4 text-[13px] data-[state=active]:bg-pos-bg-primary data-[state=active]:text-pos-text-primary data-[state=active]:shadow-sm"
            >
              General
            </TabsTrigger>
            <TabsTrigger
              value="team"
              className="h-8 rounded px-4 text-[13px] data-[state=active]:bg-pos-bg-primary data-[state=active]:text-pos-text-primary data-[state=active]:shadow-sm"
            >
              Team
            </TabsTrigger>
          </TabsList>

          {/* ── General tab ────────────────────────────────────────────────── */}
          <TabsContent value="general" className="mt-0 space-y-4">
            <div className="overflow-hidden rounded-lg border border-pos-border-tertiary bg-pos-bg-primary">
              <div className="border-b border-pos-border-tertiary px-5 py-4">
                <p className="text-[14px] font-medium text-pos-text-primary">Gold buying rate</p>
                <p className="mt-0.5 text-[13px] text-pos-text-secondary">
                  The buying rate per gram of gold (GHS). Pre-fills on every new order — staff can
                  still override it per order.
                </p>
              </div>
              <form onSubmit={handleSaveRate} className="px-5 py-5">
                <Label htmlFor="gold-rate" className="text-[12px] font-medium text-pos-text-primary">
                  Rate (GHS / g)
                </Label>
                <div className="mt-2 flex items-center gap-3">
                  <div className="flex items-center">
                    <span className="flex h-9 items-center rounded-l-md border border-r-0 border-pos-border-secondary bg-pos-bg-secondary px-3 text-[13px] text-pos-text-secondary">
                      GHS
                    </span>
                    <Input
                      id="gold-rate"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={rateInput}
                      onChange={(e) => { setRateInput(e.target.value); setRateSaved(false) }}
                      className="h-9 w-36 rounded-l-none border-pos-border-secondary text-[13px]"
                      placeholder="380.00"
                    />
                  </div>
                  <Button type="submit" size="sm" className="h-9 px-4" disabled={isSavingRate}>
                    {isSavingRate ? "Saving…" : "Save rate"}
                  </Button>
                  {rateSaved && (
                    <span className="text-[12px] text-pos-success">Rate saved</span>
                  )}
                  {rateError && (
                    <span className="text-[12px] text-red-500">{rateError}</span>
                  )}
                </div>
                {rateQuery.data?.updatedAt && (
                  <p className="mt-3 text-[11px] text-pos-text-secondary">
                    Last updated{" "}
                    {new Date(rateQuery.data.updatedAt).toLocaleString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    {rateQuery.data.updatedBy && ` · by ${rateQuery.data.updatedBy}`}
                  </p>
                )}
              </form>
            </div>
          </TabsContent>

          {/* ── Team tab ───────────────────────────────────────────────────── */}
          <TabsContent value="team" className="mt-0">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[14px] font-medium text-pos-text-primary">Team members</p>
                {!usersQuery.isPending && (
                  <p className="mt-0.5 text-[12px] text-pos-text-secondary">
                    {users.length} {users.length === 1 ? "user" : "users"}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                className="h-8 gap-1.5 px-3 text-[12px]"
                onClick={() => setShowCreate(true)}
              >
                <svg className="size-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M8 3v10M3 8h10" />
                </svg>
                Add user
              </Button>
            </div>

            <div className="space-y-2">
              {usersQuery.isPending ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonUserCard key={i} />)
              ) : users.length === 0 ? (
                <div className="rounded-lg border border-dashed border-pos-border-tertiary py-16 text-center text-[13px] text-pos-text-secondary">
                  No users found
                </div>
              ) : (
                users.map((u) => {
                  const color = avatarColor(u.name)
                  const hasGrantedRoles = u.grantedRoles.length > 0
                  const displayRoles = hasGrantedRoles ? u.grantedRoles : null

                  return (
                    <div
                      key={u.id}
                      className="flex flex-wrap items-center gap-3 rounded-lg border border-pos-border-tertiary bg-pos-bg-primary px-4 py-3.5 transition-colors hover:bg-pos-bg-secondary/30"
                    >
                      {/* Avatar */}
                      <div
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold"
                        style={{ background: color.bg, color: color.text }}
                      >
                        {initials(u.name)}
                      </div>

                      {/* Info */}
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="truncate text-[13px] font-medium text-pos-text-primary">
                          {u.name}
                        </p>
                        <p className="truncate text-[12px] text-pos-text-secondary">
                          {u.email}
                          {u.phone && (
                            <span className="ml-2 text-pos-text-secondary opacity-60">·</span>
                          )}
                          {u.phone && (
                            <span className="ml-1.5">{u.phone}</span>
                          )}
                        </p>
                      </div>

                      {/* Role badges */}
                      <div className="flex shrink-0 items-center gap-1.5">
                        {displayRoles ? (
                          displayRoles.map((r) => <RoleBadge key={r} role={r} />)
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-pos-warning-soft px-2 py-0.5 text-[11px] font-medium text-pos-warning">
                            Pending
                          </span>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex shrink-0 items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-pos-border-secondary px-3 text-[11px] text-pos-text-secondary hover:text-pos-text-primary"
                          onClick={() => {
                            setManageTarget({ user: u })
                            setGrantRoleValue("staff")
                          }}
                        >
                          Manage
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 border-pos-border-secondary px-3 text-[11px] text-pos-danger hover:border-pos-danger/40 hover:bg-pos-danger/5"
                          onClick={() => setPendingDelete({ userId: u.id, userName: u.name })}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Manage roles dialog ──────────────────────────────────────────────── */}
      <Dialog open={!!manageTarget} onOpenChange={(o) => { if (!o) setManageTarget(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Manage roles</DialogTitle>
            <DialogDescription>
              {manageTarget?.user.name} · {manageTarget?.user.email}
            </DialogDescription>
          </DialogHeader>

          {manageTarget && (
            <div className="flex flex-col gap-4">
              {/* Current roles */}
              <div>
                <p className="mb-2 text-[12px] font-medium text-pos-text-secondary">
                  Current roles
                </p>
                {manageTarget.user.grantedRoles.length === 0 ? (
                  <p className="text-[13px] text-pos-text-secondary">
                    No roles assigned — user is pending access.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1.5">
                    {manageTarget.user.grantedRoles.map((r) => (
                      <div
                        key={r}
                        className="flex items-center justify-between rounded-md border border-pos-border-tertiary px-3 py-2"
                      >
                        <RoleBadge role={r} />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] text-pos-danger hover:border-pos-danger/40 hover:bg-pos-danger/5"
                          disabled={isChangingRole}
                          onClick={() =>
                            setPendingRoleChange({
                              type: "revoke",
                              userId: manageTarget.user.id,
                              userName: manageTarget.user.name,
                              role: r as GrantableRole,
                            })
                          }
                        >
                          Revoke
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Grant role */}
              <div className="border-t border-pos-border-tertiary pt-4">
                <p className="mb-2 text-[12px] font-medium text-pos-text-secondary">Grant role</p>
                <div className="flex items-center gap-2">
                  <Select
                    value={grantRoleValue}
                    onValueChange={(v) => setGrantRoleValue(v as GrantableRole)}
                  >
                    <SelectTrigger className="h-8 flex-1 text-[12px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GRANTABLE_ROLES.map((r) => (
                        <SelectItem key={r} value={r} className="text-[12px]">
                          {roleLabel[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-8 px-4 text-[12px]"
                    disabled={isGrantingRole || isChangingRole}
                    onClick={() =>
                      setPendingRoleChange({
                        type: "grant",
                        userId: manageTarget.user.id,
                        userName: manageTarget.user.name,
                        role: grantRoleValue,
                      })
                    }
                  >
                    Grant
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Create user dialog ──────────────────────────────────────────────── */}
      <Dialog
        open={showCreate}
        onOpenChange={(o) => { if (!o) { setShowCreate(false); setCreateError(null) } }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Create a new account. The user can sign in immediately.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-name">Full name</Label>
              <Input
                id="create-name"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="Kofi Mensah"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-email">Email</Label>
              <Input
                id="create-email"
                type="email"
                value={createEmail}
                onChange={(e) => setCreateEmail(e.target.value)}
                placeholder="kofi@example.com"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-password">Password</Label>
              <Input
                id="create-password"
                type="password"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="Min. 8 characters"
                minLength={8}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="create-phone">
                Phone{" "}
              </Label>
              <Input
                id="create-phone"
                type="tel"
                value={createPhone}
                onChange={(e) => setCreatePhone(e.target.value)}
                placeholder="+233 XX XXX XXXX"
                required
              />
            </div>
            {createError && <p className="text-[12px] text-red-500">{createError}</p>}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreate(false); setCreateError(null) }}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? "Creating…" : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Confirm delete ──────────────────────────────────────────────────── */}
      <ConfirmPasswordDialog
        open={!!pendingDelete}
        title={`Remove ${pendingDelete?.userName ?? "user"}?`}
        description="This is permanent and cannot be undone. Enter your password to confirm."
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      {/* ── Confirm role change ─────────────────────────────────────────────── */}
      <ConfirmPasswordDialog
        open={!!pendingRoleChange}
        title={
          pendingRoleChange
            ? pendingRoleChange.type === "grant"
              ? `Grant ${roleLabel[pendingRoleChange.role] ?? pendingRoleChange.role} to ${pendingRoleChange.userName}?`
              : `Revoke ${roleLabel[pendingRoleChange.role] ?? pendingRoleChange.role} from ${pendingRoleChange.userName}?`
            : "Confirm role change"
        }
        description="Enter your password to confirm this role change."
        onConfirm={confirmRoleChange}
        onCancel={() => setPendingRoleChange(null)}
      />

      {/* ── Loading overlay ─────────────────────────────────────────────────── */}
      {(isDeleting || isChangingRole) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20">
          <div className="rounded-lg border border-pos-border-tertiary bg-pos-bg-primary px-6 py-4 shadow-lg">
            <p className="text-[13px] text-pos-text-primary">
              {isDeleting ? "Removing user…" : "Updating role…"}
            </p>
          </div>
        </div>
      )}
      </RequiresNetwork>
    </DashboardShell>
  )
}
