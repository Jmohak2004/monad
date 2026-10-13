"use client";

import Link from "next/link";
import { useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { AuthCard } from "@/components/AuthCard";
import { Header } from "@/components/Header";
import { chain, tokenIsMock } from "@/lib/config";

export default function AddMoney() {
  const { account } = useAccount();

  return (
    <>
      <Header>
        <Link href="/" className="text-sm text-muted underline">
          Back
        </Link>
      </Header>
      <h1 className="text-2xl font-semibold">Add money</h1>
      {!account ? (
        <AuthCard title="Sign in first" subtitle="Add money to your Ghar balance." />
      ) : (
        <>{tokenIsMock && chain.testnet && <DemoFaucet address={account.address} />}</>
      )}
    </>
  );
}

function DemoFaucet({ address }: { address: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | string>("idle");
  return (
    <section className="card flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">Demo dollars</h2>
        <p className="text-sm text-muted">Test network only: get $250 of play money to try sending.</p>
      </div>
      <button
        className="btn btn-primary"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch("/api/faucet", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ address }),
          });
          const json = await res.json().catch(() => ({}));
          setState(res.ok ? "done" : json.error || "Failed");
        }}
      >
        {state === "busy" ? "Adding…" : state === "done" ? "Added $250" : "Get $250 demo dollars"}
      </button>
      {state !== "idle" && state !== "busy" && state !== "done" && <p className="text-sm text-warn">{state}</p>}
    </section>
  );
}
