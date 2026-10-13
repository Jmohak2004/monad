// Passkey accounts via Mera (https://mera.category.xyz).
//
// A passkey's WebAuthn PRF output is 32 bytes of stable entropy. Following Mera's
// "create passkey accounts" recipe, we turn it into a BIP-39 mnemonic, then derive
// the standard Ethereum account m/44'/60'/0'/0/0. The result is a plain EOA, so
// there are no contracts to deploy, no bundler, and no custody backend. Only the
// credential ID (no key material) is kept in localStorage.

import {
  createPasskeyWithPrfOutput,
  createSecp256k1SigningSession,
  getEvmAddress,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
  type Secp256k1SigningSession,
} from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import type { Address, LocalAccount } from "viem";

const STORAGE_KEY = "ghar.passkey.v1";
const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

export type StoredPasskey = {
  credential: PasskeyCredentialMetadata;
  address: Address;
  name: string;
};

export type SignedInAccount = {
  name: string;
  address: Address;
  /** viem account that signs through the Mera session without further prompts. */
  account: LocalAccount;
  /** Zeroes the in-memory key. */
  end(): void;
};

function rp() {
  return { id: window.location.hostname, name: "Ghar" };
}

function deriveSession(prfOutput: Uint8Array): Secp256k1SigningSession {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(ACCOUNT_PATH);
  if (!node.privateKey) throw new Error("derivation produced no key");
  const session = createSecp256k1SigningSession({ privateKey: node.privateKey });
  node.wipePrivateData();
  seed.fill(0);
  prfOutput.fill(0);
  return session;
}

function toSignedIn(session: Secp256k1SigningSession, name: string): SignedInAccount {
  return {
    name,
    address: getEvmAddress(session.publicKey) as Address,
    account: toViemAccount(session),
    end: () => session.end(),
  };
}

export function getStoredPasskey(): StoredPasskey | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredPasskey) : null;
  } catch {
    return null;
  }
}

function storePasskey(p: StoredPasskey) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // Private mode etc. The user can still sign in by picking their passkey.
  }
}

export function forgetPasskey() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}

/** Creates a new passkey (one Face ID / fingerprint prompt) and signs in. */
export async function createAccount(name: string): Promise<SignedInAccount> {
  const created = await createPasskeyWithPrfOutput({
    rp: rp(),
    user: { name, displayName: name },
  });
  const signedIn = toSignedIn(deriveSession(created.prfOutput), name);
  storePasskey({
    credential: { credentialId: created.credentialId, transports: created.transports },
    address: signedIn.address,
    name,
  });
  return signedIn;
}

/** Signs in with the remembered passkey, or lets the user pick any of theirs for this site. */
export async function signIn(): Promise<SignedInAccount> {
  const stored = getStoredPasskey();
  const result = await getPasskeyPrfOutput({ rpId: rp().id, credential: stored?.credential });
  const sameCredential = stored?.credential.credentialId === result.credentialId;
  const name = sameCredential ? stored!.name : "";
  const signedIn = toSignedIn(deriveSession(result.prfOutput), name);
  storePasskey({
    credential: sameCredential ? stored!.credential : { credentialId: result.credentialId },
    address: signedIn.address,
    name,
  });
  return signedIn;
}

/** Turns Mera errors into copy a non-technical user can act on. */
export function friendlyPasskeyError(e: unknown): string {
  if (isMeraError(e)) {
    switch (e.code) {
      case "PASSKEY_OPERATION_FAILED":
        return "The passkey step was cancelled or didn't finish. Please try again.";
      case "PRF_UNAVAILABLE":
        return "This device's passkey manager isn't supported yet. On Chrome, save the passkey to Google Password Manager, or use iCloud Keychain or 1Password.";
      case "CRYPTO_UNAVAILABLE":
        return "Open this page over https to continue.";
      default:
        return e.message;
    }
  }
  return e instanceof Error ? e.message : String(e);
}
