// End-to-end smoke test of the money path, minus the passkey UI.
// A random key stands in for the sender's Mera account (Mera accounts are plain EOAs).
//
//   APP_URL=http://localhost:3000 node --env-file=.env.local scripts/smoke.mjs
//
// Needs a testnet/local deployment with MockAUSD (it uses /api/faucet).

import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseAbi,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const APP = process.env.APP_URL || "http://localhost:3000";
const RPC = process.env.NEXT_PUBLIC_RPC_URL;
const ESCROW = process.env.NEXT_PUBLIC_ESCROW_ADDRESS;
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_ADDRESS;
const AMOUNT = 42_000_000n; // $42

const token = parseAbi([
  "function approve(address,uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const escrow = parseAbi(["function create(uint256 amount, address claimKey, uint40 expiry)"]);

const pub = createPublicClient({ transport: http(RPC) });
const chainId = await pub.getChainId();
const chain = { id: chainId, name: "x", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } };

let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "✔" : "✘"} ${msg}`);
  if (!ok) failures++;
};
const post = async (path, body) => {
  const res = await fetch(`${APP}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
};

async function createLink(senderWallet) {
  const claimPk = generatePrivateKey();
  const claimKey = privateKeyToAccount(claimPk);
  const expiry = Math.floor(Date.now() / 1000) + 7 * 86400;
  let h = await senderWallet.writeContract({ address: TOKEN, abi: token, functionName: "approve", args: [ESCROW, AMOUNT] });
  await pub.waitForTransactionReceipt({ hash: h });
  h = await senderWallet.writeContract({ address: ESCROW, abi: escrow, functionName: "create", args: [AMOUNT, claimKey.address, expiry] });
  await pub.waitForTransactionReceipt({ hash: h });
  return claimKey;
}

async function signFor(claimKey, recipient) {
  const digest = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "address" }, { type: "address" }],
      [ESCROW, BigInt(chainId), claimKey.address, recipient],
    ),
  );
  return claimKey.signMessage({ message: { raw: digest } });
}

// 1. Fund a brand-new sender through the faucet.
const sender = privateKeyToAccount(generatePrivateKey());
const senderWallet = createWalletClient({ account: sender, chain, transport: http(RPC) });
const faucet = await post("/api/faucet", { address: sender.address });
check(faucet.status === 200, `faucet funds new sender (${faucet.status})`);
if (faucet.json.gasTx) await pub.waitForTransactionReceipt({ hash: faucet.json.gasTx });

// 2. Sender locks $42 behind a fresh claim key.
const claimKey = await createLink(senderWallet);
check(true, `link created for claim key ${claimKey.address}`);

// 3. Recipient (who has no gas at all) claims through the relayer.
const recipient = privateKeyToAccount(generatePrivateKey()).address;
const sig = await signFor(claimKey, recipient);
const claim = await post("/api/claim", { claimKey: claimKey.address, recipient, signature: sig });
check(claim.status === 200 && claim.json.hash, `relayer submits claim (${claim.status})`);
const bal = await pub.readContract({ address: TOKEN, abi: token, functionName: "balanceOf", args: [recipient] });
check(bal === AMOUNT, `recipient received ${bal} units`);
check((await pub.getBalance({ address: recipient })) === 0n, "recipient never needed gas");

// 4. The same link can't be used twice.
await new Promise((r) => setTimeout(r, 5500)); // wait out the per-link rate limit
const again = await post("/api/claim", { claimKey: claimKey.address, recipient, signature: sig });
check(again.status === 409, `second claim rejected (${again.status})`);

// 5. A signature for one recipient can't be redirected to another.
const claimKey2 = await createLink(senderWallet);
const sig2 = await signFor(claimKey2, recipient);
const attacker = privateKeyToAccount(generatePrivateKey()).address;
const stolen = await post("/api/claim", { claimKey: claimKey2.address, recipient: attacker, signature: sig2 });
check(stolen.status === 400, `redirected claim rejected (${stolen.status})`);

console.log(failures ? `\n${failures} check(s) failed` : "\nAll checks passed");
process.exit(failures ? 1 : 0);
