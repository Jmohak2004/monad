// Links the sender created on this device. Keeping the claim key lets the sender
// re-share a link they lost, and it lets history work before the Envio indexer is up.
// The funds still belong to the sender until claimed, so storing the key here
// doesn't put anyone else's money at risk.

import type { Address, Hex } from "viem";

export type SentLink = {
  claimKey: Address;
  claimPrivateKey: Hex;
  amount: string; // base units, as a string so it survives JSON
  expiry: number;
  createdAt: number;
  note?: string;
};

const key = (owner: Address) => `ghar.sent.v1:${owner.toLowerCase()}`;

export function loadSentLinks(owner: Address): SentLink[] {
  try {
    return JSON.parse(localStorage.getItem(key(owner)) || "[]") as SentLink[];
  } catch {
    return [];
  }
}

export function saveSentLink(owner: Address, link: SentLink) {
  try {
    const all = loadSentLinks(owner).filter((l) => l.claimKey !== link.claimKey);
    localStorage.setItem(key(owner), JSON.stringify([link, ...all]));
  } catch {}
}
