"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { AuthCard } from "@/components/AuthCard";
import { FeeComparison } from "@/components/FeeComparison";
import { Header } from "@/components/Header";
import { History } from "@/components/History";
import { ShareLink } from "@/components/ShareLink";
import { isConfigured } from "@/lib/config";
import { buildClaimLink, createClaimLink, formatUsd, getBalance, toUnits } from "@/lib/escrow";
import { saveSentLink } from "@/lib/sentLinks";

const QUICK = ["50", "100", "200"];

type SendState =
  | { kind: "idle" }
  | { kind: "sending"; step: "approve" | "create" }
  | { kind: "done"; link: string; amountLabel: string }
  | { kind: "error"; message: string };

export default function Home() {
  const { account, signOut } = useAccount();

  if (!account) {
    return (
      <>
        <Header />
        <section className="py-6">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">
            Send money home
            <br />
            <span className="text-accent">in seconds.</span>
          </h1>
          <p className="mt-3 text-muted">
            Share a link on WhatsApp. Your family taps it and the money is theirs: no app to install, no fees for
            them.
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
  const [state, setState] = useState<SendState>({ kind: "idle" });
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

  const amountUsd = Number(amount) || 0;
  let units = 0n;
  try {
    units = amount ? toUnits(amount) : 0n;
  } catch {}
  const tooMuch = balance != null && units > balance;

  async function send() {
    setState({ kind: "sending", step: "create" });
    try {
      const created = await createClaimLink(a.account, units, (step) => setState({ kind: "sending", step }));
      saveSentLink(a.address, {
        claimKey: created.claimKey,
        claimPrivateKey: created.claimPrivateKey,
        amount: created.amount.toString(),
        expiry: created.expiry,
        createdAt: Date.now(),
      });
      setState({ kind: "done", link: buildClaimLink(created.claimPrivateKey), amountLabel: formatUsd(created.amount) });
      setAmount("");
      refreshBalance();
      setRefreshKey((k) => k + 1);
    } catch (e) {
      console.error(e);
      setState({ kind: "error", message: e instanceof Error ? e.message.split("\n")[0] : "Something went wrong" });
    }
  }

  return (
    <>
      <section className="card flex items-end justify-between">
        <div>
          <p className="text-sm text-muted">{a.name ? `${a.name}'s balance` : "Your balance"}</p>
          <p className="text-4xl font-semibold tabular-nums tracking-tight">
            {balance == null ? "—" : formatUsd(balance)}
          </p>
        </div>
        <Link href="/add" className="btn btn-secondary">
          Add money
        </Link>
      </section>

      {state.kind === "done" ? (
        <section className="card flex flex-col gap-4">
          <div>
            <p className="text-sm text-muted">Ready to share</p>
            <h2 className="text-2xl font-semibold">{state.amountLabel} is on its way</h2>
            <p className="mt-1 text-sm text-muted">Send this link to the person you&apos;re paying.</p>
          </div>
          <ShareLink link={state.link} amountLabel={state.amountLabel} />
          <button className="text-sm text-muted underline" onClick={() => setState({ kind: "idle" })}>
            Send more money
          </button>
        </section>
      ) : (
        <section className="card flex flex-col gap-4">
          <h2 className="font-semibold">Send money</h2>
          <label className="flex items-center gap-2 rounded-2xl border border-line px-4 py-3 focus-within:outline-2 focus-within:outline-accent">
            <span className="text-3xl font-semibold text-muted">$</span>
            <input
              className="w-full bg-transparent text-3xl font-semibold tabular-nums outline-none"
              inputMode="decimal"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
            />
          </label>
          <div className="flex gap-2">
            {QUICK.map((q) => (
              <button key={q} className="btn btn-secondary min-h-9 flex-1 text-sm" onClick={() => setAmount(q)}>
                ${q}
              </button>
            ))}
          </div>
          <FeeComparison amountUsd={amountUsd} />
          {tooMuch && (
            <p className="text-sm text-danger">
              That&apos;s more than your balance. <Link href="/add" className="underline">Add money</Link>
            </p>
          )}
          {state.kind === "error" && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">{state.message}</p>}
          <button
            className="btn btn-primary w-full"
            disabled={!units || tooMuch || state.kind === "sending" || !isConfigured}
            onClick={send}
          >
            {state.kind === "sending"
              ? state.step === "approve"
                ? "Authorizing…"
                : "Creating link…"
              : `Send${amountUsd ? ` $${amount}` : ""}`}
          </button>
        </section>
      )}

      <History owner={a.address} refreshKey={refreshKey} />
    </>
  );
}

function ConfigWarning() {
  if (isConfigured) return null;
  return (
    <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">
      Not connected to a contract yet. Deploy <code>contracts/</code> and set <code>NEXT_PUBLIC_ESCROW_ADDRESS</code> and{" "}
      <code>NEXT_PUBLIC_TOKEN_ADDRESS</code> in <code>web/.env.local</code>.
    </p>
  );
}

