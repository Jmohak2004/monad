# Plan: "Send money home" with claim links

## The product in one line
Send AUSD to family abroad in under 30 seconds. The recipient taps a link, creates a passkey, and has money, with no app install, seed phrase, or gas.

Pilot corridor: **UAE → India** (AED → INR).

## User flow (this is the demo)
1. **Sender** opens the mobile web app and logs in with a Mera passkey.
2. **Fund:** the balance is already in AUSD, or they top up from another chain via Aurora Intents.
3. **Send:** enter an amount and see a live comparison card (Wise / Western Union / Ghar), then confirm.
4. **Share:** the app generates a claim link to send over WhatsApp.
5. **Recipient** opens the link, creates a passkey via Mera, and sees "You received $200" with the funds claimed instantly.
6. **Both sides** see a history feed powered by Envio.

## Architecture

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js PWA, mobile-first | Check whether a PWA counts as the "mobile app" Agora asks for. If not, wrap it with Capacitor. |
| Account layer | Mera (passkey) | Used for both sender and recipient |
| Contract | `ClaimEscrow.sol` on Monad | |
| Indexing | Envio HyperIndex | Indexes Created, Claimed, and Refunded events |
| RPC | Alchemy | Used as the RPC provider |
| Funding | Aurora Intents | Any-chain deposit into the sender's AUSD balance |
| Backend | Next.js API routes | Caches FX rates and relays gasless claims |

## Bounty mapping

| Bounty | The feature that satisfies it |
|---|---|
| Consumer track | The whole flow, with no crypto vocabulary in the UI |
| Agora Cross-Border | Mera onboarding + AUSD + instant settlement |
| Aurora Intents | "Fund from any chain" on the top-up screen. It must work live. |
| Mera UX | The sender and recipient both use passkeys, with no seed phrase, extension, or custody backend |
| Envio | The history feed is built from HyperIndex |
| Alchemy | Used as the RPC, mentioned in the README |

## 24-hour schedule
- **0-2 Recon:** read the bounty pages, set up accounts and keys, run a hello-world Mera login, settle the gasless-claim question.
- **2-8 Core:** build the contract, the frontend happy path, and the end-to-end flow with real AUSD.
- **8-14 Integrations:** Envio, Aurora, fee card.
- **14-19 Polish:** expired and claimed states, refund, loading and error states, a real-phone test.
- **19-22 Submission:** video, README, every field filled in.
- **22-24 Buffer:** bug fixes only.

## Fee comparison, done honestly
- Use a live mid-market FX rate from a free API.
- Keep competitor fees in a config table with the provider, fee structure, and date checked, labelled "estimates as of [date]".
- Cite sources in the UI footer.

## Demo script (2 minutes)
1. (10s) The problem: fees average several percent, and transfers take days.
2. (20s) Sender logs in with a passkey and sees the fee comparison.
3. (30s) Sender funds from another chain via Aurora, then sends $100.
4. (30s) The link opens on a second phone, the recipient creates a passkey, and the money arrives.
5. (20s) The history feed updates live on both sides.
6. (10s) "No app, no seed phrase, no gas. Just a link."

## Risks and fallbacks

| Risk | Fallback |
|---|---|
| Gasless claim doesn't work with Mera | Backend relayer pays gas (Mera accounts are plain EOAs, so this is the default) |
| Aurora flow is flaky | Support one source chain/token only |
| Bounty requires a native mobile app | Wrap the PWA with Capacitor early |
| AUSD unavailable on testnet | Deploy `MockAUSD` on testnet and ask organizers |
| Live demo fails | Backup video and pre-funded accounts |

## Pre-submission checklist
- [ ] Every bounty's required fields filled in
- [x] Deployed contract addresses in the README
- [ ] Public repo with a clean README (local README is updated; push still required)
- [x] Working demo link: https://ghar-psi.vercel.app
- [ ] 2-minute video
- [x] Each bounty mapped to a specific feature
- [ ] Tested end-to-end on a fresh phone with a fresh passkey
