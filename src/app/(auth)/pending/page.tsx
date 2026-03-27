"use client"

import { signOut } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export default function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--pos-bg-secondary)]">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-pos-border-tertiary bg-pos-bg-primary p-8 text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-pos-warning-soft">
          <svg
            className="size-6 text-pos-warning"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-[16px] font-medium text-pos-text-primary">
          Account pending approval
        </h1>
        <p className="mt-2 text-[13px] text-pos-text-secondary">
          Your account has been created but has not been granted access yet.
          Please contact your administrator to have your role assigned.
        </p>
        <Button
          className="mt-6 h-9 w-full rounded-[var(--radius-md)] bg-pos-brand text-[13px] font-medium text-white hover:bg-pos-brand-dark"
          onClick={() =>
            signOut({
              fetchOptions: {
                onSuccess: () => {
                  window.location.href = "/login"
                },
              },
            })
          }
        >
          Sign out
        </Button>
      </div>
    </div>
  )
}
