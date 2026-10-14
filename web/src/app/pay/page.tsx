"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/AccountProvider";
import { AuthCard } from "@/components/AuthCard";
import { Header } from "@/components/Header";
import { RequestStatus } from "@/lib/abi";
import { requestsConfigured } from "@/lib/config";
import { formatUsd, fromUnits, getBalance } from "@/lib/escrow";
import {
  getRequestStatus,
  PAY_RETURN_KEY,
  parsePayFragment,
  payRequest,
  savePaid,
  type Invoice,
} from "@/lib/requests";

type View =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "open" }
  | { kind: "paying"; step: "approve" | "pay" }
  | { kind: "paid"; mine: boolean }
  | { kind: "cancelled" }
  | { kind: "expired" }
  | { kind: "error"; message: string };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

export default function PayPage() {
  const { account } = useAccount();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [view, setView] = useState<View>({ kind: "loading" });
  const [balance, setBalance] = useState<bigint | null>(null);
  const paidByMe = useRef(false);

  const load = useCallback(async (i: Invoice | null) => {
    if (!i || !requestsConfigured) return setView({ kind: "invalid" });
    try {
      const s = await getRequestStatus(i.payee, i.id);
      if (s === RequestStatus.Paid) return setView({ kind: "paid", mine: paidByMe.current });
      if (s === RequestStatus.Cancelled) return setView({ kind: "cancelled" });
      if (i.expiry < Date.now() / 1000) return setView({ kind: "expired" });
      setView({ kind: "open" });
    } catch (e) {
      setView({
        kind: "error",
        message: e instanceof Error ? e.message.split("\n")[0] : "Couldn't open this request",
      });
    }
  }, []);

  useEffect(() => {
    const i = parsePayFragment(window.location.search || window.location.hash);
    setInv(i);
    load(i);
  }, [load]);

  useEffect(() => {
    if (!account) return setBalance(null);
    const refresh = () => getBalance(account.address).then(setBalance).catch(() => setBalance(null));
    refresh();
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [account]);

  async function pay() {
    if (!account || !inv) return;
    setView({ kind: "paying", step: "pay" });
    try {
      await payRequest(account.account, inv, (step) => setView({ kind: "paying", step }));
      paidByMe.current = true;
      savePaid(account.address, inv);
      sessionStorage.removeItem(PAY_RETURN_KEY);
      history.replaceState(null, "", "/pay");
      setView({ kind: "paid", mine: true });
    } catch (e) {
      console.error(e);
      setView({ kind: "error", message: e instanceof Error ? e.message.split("\n")[0] : "Payment failed" });
    }
  }

  const who = inv?.name || (inv ? short(inv.payee) : "");
  const own = account && inv && account.address.toLowerCase() === inv.payee.toLowerCase();
  const needsMore = balance != null && inv != null && balance < inv.amount;

  return (
    <>
      <Header />
      {view.kind === "loading" && <p className="py-10 text-center text-muted">Opening the request…</p>}
      {view.kind === "invalid" && (
        <Message title="This QR doesn't work" body="It may be incomplete. Ask the person to share it again." />
      )}
      {view.kind === "cancelled" && (
        <Message title="This request was cancelled" body={`${who} cancelled it. Ask them for a new QR if they still need money.`} />
      )}
      {view.kind === "expired" && (
        <Message title="This request has expired" body={`It was only payable for 7 days. Ask ${who} for a new QR.`} />
      )}
      {view.kind === "paid" &&
        (view.mine ? (
          <section className="rise card flex flex-col gap-3 py-8">
            <div className="flex h-14 w-14 items-center justify-center bg-accent text-2xl text-accent-ink">✓</div>
            <p className="text-sm text-muted">You paid {who}</p>
            <p className="display text-6xl tabular-nums">{formatUsd(inv!.amount)}</p>
            <p className="text-sm text-muted">It&apos;s in their Ghar balance now.</p>
            <Link href="/" className="btn btn-primary mt-2 w-full">
              Go to my balance
            </Link>
          </section>
        ) : (
          <Message title="Already paid" body="Someone has already paid this request, so it can't be paid again." />
        ))}

      {inv && (view.kind === "open" || view.kind === "paying" || view.kind === "error") && (
        <>
          <section className="py-6">
            <p className="text-muted">
              {inv.name || "Someone"} is asking for
              {inv.name && <span className="text-xs"> ({short(inv.payee)})</span>}
            </p>
            <p className="display mt-2 text-6xl tabular-nums">{formatUsd(inv.amount)}</p>
            <LocalAmount usd={fromUnits(inv.amount)} />
            <p className="mt-2 text-xs text-muted">
              One-time request · payable until {new Date(inv.expiry * 1000).toLocaleDateString()}
            </p>
          </section>

          {!account ? (
            <AuthCard
              title="Sign in to pay"
              subtitle="You pay from your Ghar dollar balance. No card or bank details needed."
              cta="Create account"
            />
          ) : own ? (
            <p className="bg-warn-soft p-3 text-sm text-warn">
              This is your own request. Share it with the person who&apos;s paying you.
            </p>
          ) : (
            <>
              <p className="text-sm text-muted">
                Your balance: <span className="tabular-nums">{balance == null ? "—" : formatUsd(balance)}</span>
              </p>
              {needsMore ? (
                <>
                  <p className="text-sm text-warn">
                    You need {formatUsd(inv.amount - balance!)} more. Add money, then come back to pay.
                  </p>
                  <Link
                    href="/add"
                    className="btn btn-primary w-full"
                    onClick={() => sessionStorage.setItem(PAY_RETURN_KEY, `/pay${window.location.search || window.location.hash}`)}
                  >
                    Add money
                  </Link>
                </>
              ) : (
                <button className="btn btn-primary w-full" disabled={view.kind === "paying" || balance == null} onClick={pay}>
                  {view.kind === "paying"
                    ? view.step === "approve"
                      ? "Authorizing…"
                      : "Paying…"
                    : view.kind === "error"
                      ? "Try again"
                      : `Pay ${formatUsd(inv.amount)}`}
                </button>
              )}
            </>
          )}
          {view.kind === "error" && <p className="bg-warn-soft p-3 text-sm text-warn">{view.message}</p>}
        </>
      )}
    </>
  );
}

const currencyName = (code: string) => {
  try {
    return new Intl.DisplayNames(undefined, { type: "currency" }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** The charge is always dollars; this is just what it's worth in the payer's currency. */
function LocalAmount({ usd }: { usd: number }) {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [code, setCode] = useState("AED");

  useEffect(() => {
    fetch("/api/fx")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRates(j?.rates ?? null))
      .catch(() => setRates(null));
  }, []);

  if (!rates) return null;
  const local = (usd * (rates[code] ?? 0)).toLocaleString(undefined, { style: "currency", currency: code });

  return (
    <div className="mt-3 flex items-center gap-2 text-sm text-muted">
      <span>
        ≈ <span className="font-semibold text-ink tabular-nums">{local}</span>
      </span>
      <select
        className="border-b border-line bg-transparent py-1 text-ink"
        aria-label="Show in currency"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      >
        {Object.keys(rates)
          .sort()
          .map((c) => (
            <option key={c} value={c} className="text-[#1436c8]">
              {c} · {currencyName(c)}
            </option>
          ))}
      </select>
    </div>
  );
}

function Message({ title, body }: { title: string; body: string }) {
  return (
    <section className="card flex flex-col gap-2 py-8">
      <h1 className="display text-4xl">{title}</h1>
      <p className="text-sm text-muted">{body}</p>
      <Link href="/" className="btn btn-secondary mt-3">
        Go to Ghar
      </Link>
    </section>
  );
}
