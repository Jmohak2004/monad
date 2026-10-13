"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { useAccount } from "@/components/AccountProvider";
import { AuthCard } from "@/components/AuthCard";
import { Header } from "@/components/Header";
import { TransferStatus } from "@/lib/abi";
import { isConfigured } from "@/lib/config";
import { formatUsd, getTransfer, parseClaimFragment, signClaim, type OnchainTransfer } from "@/lib/escrow";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "ready"; transfer: OnchainTransfer }
  | { kind: "claiming"; transfer: OnchainTransfer }
  | { kind: "claimed"; amount: bigint; mine: boolean }
  | { kind: "refunded" }
  | { kind: "expired"; transfer: OnchainTransfer }
  | { kind: "error"; transfer: OnchainTransfer; message: string };

export default function ClaimPage() {
  const { account } = useAccount();
  const [view, setView] = useState<View>({ kind: "loading" });
  const keyRef = useRef<Hex | null>(null);
  const claimedByMe = useRef(false);
  const autoTried = useRef(false);

  const load = useCallback(async () => {
    const pk = keyRef.current;
    if (!pk || !isConfigured) return setView({ kind: "invalid" });
    try {
      const t = await getTransfer(privateKeyToAccount(pk).address);
      if (t.status === TransferStatus.None) return setView({ kind: "invalid" });
      if (t.status === TransferStatus.Claimed) return setView({ kind: "claimed", amount: t.amount, mine: claimedByMe.current });
      if (t.status === TransferStatus.Refunded) return setView({ kind: "refunded" });
      if (t.expiry < Date.now() / 1000) return setView({ kind: "expired", transfer: t });
      setView({ kind: "ready", transfer: t });
    } catch {
      setView({ kind: "invalid" });
    }
  }, []);

  useEffect(() => {
    keyRef.current = parseClaimFragment(window.location.hash);
    load();
  }, [load]);

  const claim = useCallback(
    async (recipient: Address, transfer: OnchainTransfer) => {
      setView({ kind: "claiming", transfer });
      try {
        const { claimKey, signature } = await signClaim(keyRef.current!, recipient);
        const res = await fetch("/api/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ claimKey, recipient, signature }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Claim failed");
        claimedByMe.current = true;
        // The link is spent; drop the key from the address bar and browser history.
        history.replaceState(null, "", "/claim");
        setView({ kind: "claimed", amount: transfer.amount, mine: true });
      } catch (e) {
        setView({ kind: "error", transfer, message: e instanceof Error ? e.message : "Claim failed" });
      }
    },
    [],
  );

  // Once the recipient has an account, receive automatically: that's the whole point.
  useEffect(() => {
    if (account && view.kind === "ready" && !autoTried.current) {
      autoTried.current = true;
      claim(account.address, view.transfer);
    }
  }, [account, view, claim]);

  return (
    <>
      <Header />
      {view.kind === "loading" && <p className="py-10 text-center text-muted">Opening your link…</p>}

      {view.kind === "invalid" && (
        <Message title="This link doesn't work" body="It may be incomplete. Ask the sender to share it again." />
      )}

      {view.kind === "refunded" && (
        <Message title="This money was returned" body="The sender took it back. Ask them to send a new link." />
      )}

      {view.kind === "expired" && (
        <Message
          title="This link has expired"
          body={`${formatUsd(view.transfer.amount)} wasn't opened in time, so it's going back to the sender. Ask them to send a new link.`}
        />
      )}

      {view.kind === "claimed" &&
        (view.mine ? (
          <section className="card flex flex-col items-center gap-3 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl text-accent-ink">
              ✓
            </div>
            <p className="text-sm text-muted">You received</p>
            <p className="text-5xl font-semibold tabular-nums tracking-tight">{formatUsd(view.amount)}</p>
            <p className="text-sm text-muted">It&apos;s in your Ghar balance now. No fees were taken.</p>
            <Link href="/" className="btn btn-primary mt-2 w-full">
              See my balance
            </Link>
          </section>
        ) : (
          <Message title="Already received" body="This link has already been used." />
        ))}

      {(view.kind === "ready" || view.kind === "claiming" || view.kind === "error") && (
        <>
          <section className="py-6 text-center">
            <p className="text-muted">Someone sent you</p>
            <p className="text-6xl font-semibold tabular-nums tracking-tight">{formatUsd(view.transfer.amount)}</p>
          </section>
          {view.kind === "claiming" ? (
            <p className="card text-center text-muted">Adding it to your balance…</p>
          ) : account ? (
            <button className="btn btn-primary w-full" onClick={() => claim(account.address, view.transfer)}>
              {view.kind === "error" ? "Try again" : `Receive ${formatUsd(view.transfer.amount)}`}
            </button>
          ) : (
            <AuthCard
              title="Create an account to receive it"
              subtitle="Takes a few seconds. It's free, and you don't need to install anything."
              cta="Create account & receive"
            />
          )}
          {view.kind === "error" && <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">{view.message}</p>}
        </>
      )}
    </>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="card flex flex-col gap-2 py-8 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="text-sm text-muted">{body}</p>
      <Link href="/" className="btn btn-secondary mt-3">
        Go to Ghar
      </Link>
    </section>
  );
}
