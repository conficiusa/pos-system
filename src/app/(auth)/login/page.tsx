"use client";

import { useState } from "react";
import { signIn } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: authError } = await signIn.email({
        email,
        password,
        callbackURL: "/",
      });
      if (authError) {
        setError(authError.message ?? "Invalid email or password.");
      } else {
        window.location.assign("/");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Brand mark */}
      <div className="mb-8 text-center">
        <div className="inline-flex size-12 items-center justify-center rounded-[var(--radius-lg)] bg-pos-brand">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="8" />
            <path d="M9 12h6M12 9l3 3-3 3" />
          </svg>
        </div>
        <p className="mt-3 text-[13px] font-medium text-pos-text-primary">
          GoldPOS
        </p>
        <p className="mt-0.5 text-[12px] text-pos-text-tertiary">
          Sign in to your account
        </p>
      </div>

      {/* Card */}
      <div className="rounded-[var(--radius-xl)] border border-pos-border-tertiary bg-pos-bg-primary p-6 shadow-sm">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-pos-text-secondary">
              Email
            </label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
              className="h-9 rounded-[var(--radius-md)] border-pos-border-secondary text-[13px]"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] font-medium text-pos-text-secondary">
              Password
            </label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="h-9 rounded-[var(--radius-md)] border-pos-border-secondary text-[13px]"
            />
          </div>

          {error && (
            <div className="rounded-[var(--radius-md)] bg-pos-danger-soft px-3 py-2 text-[12px] text-pos-danger">
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="mt-1 h-9 rounded-[var(--radius-md)] bg-pos-brand text-[13px] font-medium text-white hover:bg-pos-brand-dark"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>

      <p className="mt-4 text-center text-[12px] text-pos-text-tertiary">
        Contact your administrator to get access.
      </p>
    </div>
  );
}
