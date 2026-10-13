"use client";

import { useState } from "react";
import { useAccount } from "./AccountProvider";

export function AuthCard({ title, subtitle, cta = "Create account" }: { title: string; subtitle: string; cta?: string }) {
  const { stored, busy, error, create, signIn } = useAccount();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<"auto" | "create">("auto");
  const returning = stored && mode === "auto";

  return (
    <section className="card flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold">{returning ? `Welcome back${stored.name ? `, ${stored.name}` : ""}` : title}</h2>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
      </div>

      {returning ? (
        <>
          <button className="btn btn-primary w-full" disabled={busy} onClick={() => signIn()}>
            {busy ? "Waiting for passkey…" : "Continue with passkey"}
          </button>
          <button className="text-sm text-muted underline" onClick={() => setMode("create")}>
            Use a different account
          </button>
        </>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) create(name.trim());
          }}
        >
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Your first name</span>
            <input
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya"
              autoComplete="given-name"
              maxLength={40}
            />
          </label>
          <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
            {busy ? "Waiting for passkey…" : cta}
          </button>
          <button type="button" className="text-sm text-muted underline" disabled={busy} onClick={() => signIn()}>
            I already have an account
          </button>
        </form>
      )}

      <p className="text-xs text-muted">
        Uses your phone&apos;s Face ID, fingerprint, or screen lock. There&apos;s no password or recovery phrase, and
        nothing is stored on our servers.
      </p>
      {error && <p className="bg-warn-soft p-3 text-sm text-warn">{error}</p>}
    </section>
  );
}
