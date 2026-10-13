"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  createAccount,
  forgetPasskey,
  friendlyPasskeyError,
  getStoredPasskey,
  signIn,
  type SignedInAccount,
  type StoredPasskey,
} from "@/lib/mera";

type AccountState = {
  /** Live signing account, held in memory for the signed-in period. */
  account: SignedInAccount | null;
  /** Remembered passkey on this device (no key material). */
  stored: StoredPasskey | null;
  busy: boolean;
  error: string | null;
  create(name: string): Promise<SignedInAccount | null>;
  signIn(): Promise<SignedInAccount | null>;
  signOut(forget?: boolean): void;
};

const Ctx = createContext<AccountState | null>(null);

// Session pattern: we hold the Mera signing session while signed in, so sending
// takes one Face ID prompt at sign-in, not one per transaction. It's ended on
// sign-out and after 15 minutes idle.
const IDLE_MS = 15 * 60_000;

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<SignedInAccount | null>(null);
  const [stored, setStored] = useState<StoredPasskey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setStored(getStoredPasskey()), []);

  const run = useCallback(async (fn: () => Promise<SignedInAccount>) => {
    setBusy(true);
    setError(null);
    try {
      const a = await fn();
      setAccount((prev) => {
        prev?.end();
        return a;
      });
      setStored(getStoredPasskey());
      return a;
    } catch (e) {
      setError(friendlyPasskeyError(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const signOut = useCallback((forget = false) => {
    setAccount((prev) => {
      prev?.end();
      return null;
    });
    if (forget) {
      forgetPasskey();
      setStored(null);
    }
  }, []);

  useEffect(() => {
    if (!account) return;
    let timer = setTimeout(() => signOut(), IDLE_MS);
    const bump = () => {
      clearTimeout(timer);
      timer = setTimeout(() => signOut(), IDLE_MS);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [account, signOut]);

  return (
    <Ctx.Provider
      value={{
        account,
        stored,
        busy,
        error,
        create: (name) => run(() => createAccount(name)),
        signIn: () => run(signIn),
        signOut,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAccount() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAccount must be used inside AccountProvider");
  return v;
}
