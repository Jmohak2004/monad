# Ghar — send money home with a link

Send AUSD to family abroad in under 30 seconds. The recipient taps a link,
creates a passkey, and has the money. They don't install an app, write down a
seed phrase, or need gas.

Built on **Monad**, with **Mera** passkey accounts, **AUSD** (Agora),
**Envio HyperIndex**, **Aurora Intents**, and **Alchemy** RPC.

## Repo layout

| Path | What |
|---|---|
| [`contracts/`](contracts/) | `ClaimEscrow.sol`: link-based escrow (create / claim / refund), Hardhat tests, deploy scripts |
| [`web/`](web/) | Next.js mobile-first PWA for send, claim, and history, plus the API routes (gasless claim relayer, FX) |
| [`indexer/`](indexer/) | Envio HyperIndex config that indexes `Created`, `Claimed`, and `Refunded` |
| [`docs/`](docs/) | Plan, bounty checklist, demo script |

## How a claim link works

1. The sender's browser generates a fresh **ephemeral keypair**.
2. `ClaimEscrow.create(amount, claimKeyAddress, expiry)` locks the AUSD. The
   ephemeral key's **address** is the transfer's ID.
3. The link is `https://<app>/claim#k=<ephemeralPrivateKey>`. The key lives in
   the URL **fragment**, so browsers never send it to the server.
4. The recipient opens the link and creates a Mera passkey, which gives them an
   address. The page signs `(escrow, chainId, claimKey, recipient)` with the
   ephemeral key.
5. The relayer submits `claim(claimKey, recipient, sig)` and pays the gas. The
   signature binds the payout to the recipient's address, so anyone who sees the
   transaction in the mempool can't redirect the funds.
6. If nobody claims before expiry, the sender calls `refund(claimKey)`.

See [`docs/PLAN.md`](docs/PLAN.md) for the full plan and bounty mapping.
