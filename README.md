# Ghar: ask family for money with one QR

Type "I need $200" and share a one-time QR on WhatsApp, like a UPI request. Your
parents scan it, sign in with a passkey (Face ID or fingerprint), and pay from their
Ghar dollar balance. The money lands in yours, and the QR can't be paid twice.
Links already sent through the original claim-link flow keep working.

Built on **Monad** with **Mera** passkey accounts, **AUSD** (Agora), an **Envio
HyperIndex** activity feed, **Aurora Intents** top-ups, and **Alchemy** RPC.
Pilot corridor: UAE/US → India.

## How it works

### Request QR (the home screen)

1. The payee enters a dollar amount. Their passkey account signs `(PaymentRequest, chainId, payee, amount, requestId, expiry)` with no transaction, and the app shows a QR card (share it as a picture, or copy the link). The invoice travels in the URL fragment: `/pay#p=…&a=…&i=…&e=…&s=…`.
2. The payer opens `/pay`, sees the dollar charge plus its value in any country currency, and pays with `approve` + `pay` on [`PaymentRequest.sol`](contracts/contracts/PaymentRequest.sol). AUSD moves straight from payer to payee. If they're short, Add money (Aurora or the testnet faucet) brings them back to the same request.
3. The contract marks `status[payee][requestId]` paid, so a second payment reverts. Requests expire after 7 days, and the payee can `cancel` one early from Activity, which kills any saved copy of the QR.

### Claim links (original flow, still claimable)

```
 Sender (Mera passkey EOA)                 Recipient (new Mera passkey EOA)
   │ 1. approve + create(amount, claimKey, expiry)        ▲
   ▼                                                     │ 5. AUSD paid out
 ┌─────────────────────── ClaimEscrow (Monad) ───────────┴──────┐
 │ transfers[claimKey] = {sender, amount, expiry, status}         │
 │ claim(claimKey, recipient, sig)   refund(claimKey) after expiry│
 └───────────▲───────────────────────────────────┬───────────────┘
             │ 4. relayer submits, pays gas       │ events
   /api/claim (Next.js)                           ▼
             ▲ 3. sig = claimKey.sign(escrow, chainId, claimKey, recipient)
             │                              Envio HyperIndex → GraphQL → Activity feed
 2. link: https://app/claim#k=<ephemeral private key>   (fragment never reaches a server)
```

1. The sender's browser generates a fresh **ephemeral keypair**, and its address (`claimKey`) becomes the transfer ID.
2. The link carries the private key in the **URL fragment**, which browsers never send to servers.
3. The recipient opens the link and creates a Mera passkey, which derives their address. The page then signs `(escrow, chainId, claimKey, recipient)` with the ephemeral key.
4. The **relayer** checks the signature and the transfer state off-chain, then submits `claim` and pays the gas. The signature commits to the recipient's address, so neither the relayer nor anyone watching the mempool can redirect the funds.
5. If nobody claims the link within 7 days, the sender can **take it back** (`refund`).

## Repo layout

| Path | What |
|---|---|
| [`contracts/`](contracts/) | [`PaymentRequest.sol`](contracts/contracts/PaymentRequest.sol), [`ClaimEscrow.sol`](contracts/contracts/ClaimEscrow.sol), [`MockAUSD.sol`](contracts/contracts/MockAUSD.sol) (testnet only), [tests](contracts/test/), [deploy script](contracts/scripts/deploy.ts) |
| [`web/`](web/) | Next.js mobile-first PWA and API routes (relayer, faucet, FX, Aurora) |
| [`indexer/`](indexer/) | Envio HyperIndex config, schema, handlers, tests |
| [`android/`](android/) | Android app (Trusted Web Activity), opens in Android Studio; see [`android/README.md`](android/README.md) |
| [`docs/PLAN.md`](docs/PLAN.md) | Plan, schedule, demo script, risks |

## Bounty mapping

| Bounty | Where it lives |
|---|---|
| **Mobile app** | [`android/`](android/): a native Android app (Trusted Web Activity) for Google Play. It runs the web app in Chrome so Mera passkeys (WebAuthn PRF) work, and App Links open WhatsApp claim links in the app. |
| **Consumer track** | The whole flow. The UI talks about "dollars", "account", and "link", never wallets, gas, or seed phrases. See [`web/src/app/page.tsx`](web/src/app/page.tsx) and [`web/src/app/claim/page.tsx`](web/src/app/claim/page.tsx). |
| **Agora (cross-border)** | AUSD is the settlement asset, paid in seconds on Monad. The pay page shows the dollar charge in any country currency from a live mid-market rate ([`web/src/app/pay/page.tsx`](web/src/app/pay/page.tsx), [`api/fx`](web/src/app/api/fx/route.ts)). |
| **Mera** | Both sender and recipient use passkey accounts via `@category-labs/mera`, derived per Mera's recipe (PRF → BIP-39 → `m/44'/60'/0'/0/0`). There's no seed phrase, extension, or custody backend, and only the credential ID is stored ([`web/src/lib/mera.ts`](web/src/lib/mera.ts), [`AccountProvider.tsx`](web/src/components/AccountProvider.tsx)). |
| **Envio** | The Activity feed reads `Request` and `Transfer` entities from HyperIndex GraphQL, polled live ([`indexer/`](indexer/), [`web/src/lib/history.ts`](web/src/lib/history.ts)). |
| **Aurora Intents** | Add money → "From another account". A persistent deposit address on Base, Arbitrum, Solana, and other chains delivers AUSD on Monad, with live deposit status ([`web/src/lib/server/aurora.ts`](web/src/lib/server/aurora.ts), [`web/src/app/add/page.tsx`](web/src/app/add/page.tsx)). |
| **Alchemy** | The Monad RPC (`NEXT_PUBLIC_RPC_URL`, `MONAD_TESTNET_RPC_URL`) for the app, the relayer, and deploys. |

## Run it locally (Hardhat chain, about 5 minutes)

```bash
# 1. Chain + contracts
cd contracts && npm install
npx hardhat test                 # 16 tests
npx hardhat node                 # keep running
npm run deploy:local             # in another terminal → deployments/31337.json

# 2. Web app
cd ../web && npm install
cp .env.example .env.local       # set CHAIN_ID=31337, RPC=http://127.0.0.1:8545,
                                 # escrow/requests/token from deployments/31337.json,
                                 # RELAYER_PRIVATE_KEY = a Hardhat test account key
npm run dev                      # http://localhost:3000
APP_URL=http://localhost:3000 npm run smoke   # end-to-end money path, no browser
```

Passkeys need a secure context. `localhost` works on desktop. To test on a phone,
use an HTTPS tunnel or deploy, and note that a passkey is bound to the domain it
was created on.

## Deploy to Monad testnet

1. Fund a deployer key and a relayer key with testnet MON from https://faucet.monad.xyz.
2. `cd contracts && cp .env.example .env`, fill in `DEPLOYER_PRIVATE_KEY` and the Alchemy URL, then `npm run deploy:testnet`. Leave `AUSD_ADDRESS` empty to deploy MockAUSD.
   Already deployed? `npm run deploy:requests:testnet` adds only `PaymentRequest` against the existing token, so live claim links keep working.
3. Copy the addresses from `contracts/deployments/10143.json` into the web app's env (`NEXT_PUBLIC_REQUESTS_ADDRESS` is `requests`) and into `indexer/.env` (`ENVIO_ESCROW_ADDRESS`, `ENVIO_REQUESTS_ADDRESS`, and the deploy block as `start_block`).
4. `cd indexer && npm run dev` (Node 22.15+, Docker), then set `NEXT_PUBLIC_ENVIO_GRAPHQL_URL`.
5. Deploy `web/` (e.g. Vercel) with the env vars from [`web/.env.example`](web/.env.example). `RELAYER_PRIVATE_KEY` and `AURORA_API_KEY` are server-only.

For mainnet (chain 143), set `AUSD_ADDRESS=0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a`
(verify it first) and `NEXT_PUBLIC_TOKEN_IS_MOCK=false`.

## Deployed addresses

| Network | ClaimEscrow | Token |
|---|---|---|
| Monad testnet (10143) | [`0xA455e47354eb8Bb1Aa00edA192D40773892c2385`](https://testnet.monadvision.com/address/0xA455e47354eb8Bb1Aa00edA192D40773892c2385) | [`0xF1Fc08DcdCAa83953e54dd675F66c6C6EC6AfFd5`](https://testnet.monadvision.com/address/0xF1Fc08DcdCAa83953e54dd675F66c6C6EC6AfFd5) (MockAUSD, deploy block 70760893) |

Demo: https://ghar-psi.vercel.app (passkeys are bound to this hostname).

## Known gaps / next steps

- **Payers pay their own gas** (approve + pay), as senders did for links. The testnet faucet tops up MON. Making it gasless needs a permit-based relayed `pay`.
- **Open requests live only on the payee's phone** until paid or cancelled; the indexer only sees settled ones.
- **Aurora delivers real AUSD on Monad mainnet.** On testnet the app's balance is MockAUSD, so Aurora deposits won't appear in it. Creating deposit addresses also requires an Aurora-approved API key.
- The relayer's rate limiter is in-memory, which suits a single-instance demo.
- Cash-out to INR isn't included. The recipient holds digital dollars.

## Security notes

- The claim signature is bound to the escrow address, the chain ID, the claim key, and the recipient, which blocks replays across deployments and chains as well as redirected payouts (covered in tests).
- The relayer verifies the signature and transfer state before spending gas, and the contract re-verifies both.
- While signed in, the Mera signing session stays in memory for convenience. It ends on sign-out or after 15 minutes idle.
- Anyone who holds a link can claim it, as with a cash voucher. The UI warns senders about this.
- A request signature binds the contract, chain, payee, amount, id, and expiry, so the amount or payee can't be edited and it can't replay elsewhere. Request status is keyed by payee, so nobody else can cancel or pre-spend your request id (covered in tests). Anyone holding the QR can pay it once; that only ever sends money to the payee.
