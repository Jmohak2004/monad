// Competitor fee estimates for the comparison card.
//
// TODO before the demo: check each provider's live quote for USD -> INR at a
// typical amount ($200), update the numbers, and set `checkedOn`. Until then the
// UI labels these as unverified estimates. Don't scrape; just look and write it down.

export type Provider = {
  name: string;
  /** Flat fee charged to the sender, in USD. */
  fixedFeeUsd: number;
  /** Percentage fee on the amount sent. */
  pctFee: number;
  /** How far the provider's exchange rate sits below mid-market, as a percentage. */
  fxMarkupPct: number;
  /** Typical time until the money arrives. */
  speed: string;
  source: string;
  /** ISO date the numbers were checked, or null if they're placeholders. */
  checkedOn: string | null;
};

export const PROVIDERS: Provider[] = [
  {
    name: "Wise",
    fixedFeeUsd: 0,
    pctFee: 0.6,
    fxMarkupPct: 0,
    speed: "Hours to 1 day",
    source: "https://wise.com/us/send-money/send-money-to-india",
    checkedOn: null,
  },
  {
    name: "Western Union",
    fixedFeeUsd: 2.99,
    pctFee: 0,
    fxMarkupPct: 1.5,
    speed: "Minutes to days",
    source: "https://www.westernunion.com/us/en/send-money-to-india.html",
    checkedOn: null,
  },
  {
    name: "Bank wire",
    fixedFeeUsd: 25,
    pctFee: 0,
    fxMarkupPct: 3,
    speed: "1-5 days",
    source: "Typical US bank outgoing international wire",
    checkedOn: null,
  },
];

/** What the recipient ends up with, in the payout currency. */
export function recipientGets(p: Provider, amountUsd: number, midRate: number) {
  const afterFees = Math.max(0, amountUsd - p.fixedFeeUsd - (amountUsd * p.pctFee) / 100);
  return afterFees * midRate * (1 - p.fxMarkupPct / 100);
}

export function totalCostUsd(p: Provider, amountUsd: number) {
  return p.fixedFeeUsd + (amountUsd * p.pctFee) / 100 + (amountUsd * p.fxMarkupPct) / 100;
}

export const allVerified = PROVIDERS.every((p) => p.checkedOn);
