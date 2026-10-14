"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { AuthCard } from "@/components/AuthCard";
import { Header } from "@/components/Header";
import { History } from "@/components/History";
import { RequestCard } from "@/components/RequestCard";
import { isConfigured, requestsConfigured } from "@/lib/config";
import { formatUsd, getBalance, toUnits } from "@/lib/escrow";
import { createRequest, saveRequest, type Invoice } from "@/lib/requests";

const QUICK = ["50", "100", "200"];

type RequestState =
  | { kind: "idle" }
  | { kind: "signing" }
  | { kind: "done"; invoice: Invoice }
  | { kind: "error"; message: string };

export default function Home() {
  const { account, signOut } = useAccount();

  if (!account) {
    return (
      <>
        <Header />
        <section className="py-6">
          <h1 className="display text-5xl">
            Ask family for money
            <br />
            <span className="text-accent">with one QR.</span>
          </h1>
          <p className="mt-3 text-muted">
            Type how much you need and share a QR on WhatsApp. They scan it, pay in seconds, and it lands in your
            balance.
          </p>
        </section>
        <AuthCard title="Get started" subtitle="Create your account in one tap." />
        <ConfigWarning />
      </>
    );
  }

  return (
    <>
      <Header>
        <button className="text-sm text-muted underline" onClick={() => signOut()}>
          Sign out
        </button>
      </Header>
      <ConfigWarning />
      <SignedIn />
    </>
  );
}

function SignedIn() {
  const { account } = useAccount();
  const a = account!;
  const [balance, setBalance] = useState<bigint | null>(null);
  const [amount, setAmount] = useState("");
  const [state, setState] = useState<RequestState>({ kind: "idle" });
  const [refreshKey, setRefreshKey] = useState(0);

  const refreshBalance = useCallback(() => {
    if (!isConfigured) return;
    getBalance(a.address).then(setBalance).catch(() => setBalance(null));
  }, [a.address]);

  useEffect(() => {
    refreshBalance();
    const t = setInterval(refreshBalance, 5000);
    return () => clearInterval(t);
  }, [refreshBalance]);

  let units = 0n;
  try {
    units = amount ? toUnits(amount) : 0n;
  } catch {}

  async function request() {
    setState({ kind: "signing" });
    try {
      const invoice = await createRequest(a.account, units, a.name);
      saveRequest(invoice);
      setState({ kind: "done", invoice });
      setAmount("");
      setRefreshKey((k) => k + 1);
    } catch (e) {
      console.error(e);
      setState({ kind: "error", message: e instanceof Error ? e.message.split("\n")[0] : "Something went wrong" });
    }
  }

  return (
    <>
      {state.kind === "done" ? (
        <section className="rise flex flex-col gap-4 pt-4">
          <div>
            <p className="text-sm text-muted">Ready to share</p>
            <h2 className="display mt-2 text-5xl">Request for {formatUsd(state.invoice.amount)}</h2>
            <p className="mt-3 text-muted">Send this QR to the person paying you. It works once.</p>
          </div>
          <RequestCard invoice={state.invoice} />
          <button className="btn btn-secondary w-full" onClick={() => setState({ kind: "idle" })}>
            Request more money
          </button>
        </section>
      ) : (
        <section className="flex flex-col gap-4 pt-2">
          <p className="text-sm text-muted">How much do you need?</p>
          <label className="flex items-baseline gap-1 border-b border-line pb-2">
            <span className="display text-6xl">$</span>
            <input
              className="display w-full min-w-0 bg-transparent text-6xl tabular-nums outline-none placeholder:text-white/40"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
            />
          </label>
          <div className="flex gap-2">
            {QUICK.map((q) => (
              <button key={q} className="btn btn-secondary min-h-12 flex-1" onClick={() => setAmount(q)}>
                ${q}
              </button>
            ))}
          </div>
          <div className="flex items-end justify-between gap-3 border-t border-line pt-3">
            <div>
              <p className="text-sm text-muted">{a.name ? `${a.name}'s balance` : "Your balance"}</p>
              <p className="text-xl font-semibold tabular-nums">{balance == null ? "—" : formatUsd(balance)}</p>
            </div>
            <Link href="/add" className="btn btn-secondary min-h-12">
              Add money
            </Link>
          </div>
          {state.kind === "error" && <p className="bg-warn-soft p-3 text-sm text-warn">{state.message}</p>}
          <button
            className="btn btn-primary w-full"
            disabled={!units || state.kind === "signing" || !requestsConfigured}
            onClick={request}
          >
            {state.kind === "signing" ? "Creating QR…" : `Request${units ? ` $${amount}` : ""}`}
          </button>
        </section>
      )}

      <History owner={a.address} refreshKey={refreshKey} />
    </>
  );
}

function ConfigWarning() {
  if (isConfigured && requestsConfigured) return null;
  return (
    <p className="bg-warn-soft p-3 text-sm text-warn">
      Not connected to a contract yet. Deploy <code>contracts/</code> and set <code>NEXT_PUBLIC_ESCROW_ADDRESS</code>,{" "}
      <code>NEXT_PUBLIC_REQUESTS_ADDRESS</code>, and <code>NEXT_PUBLIC_TOKEN_ADDRESS</code> in <code>web/.env.local</code>.
    </p>
  );
}
