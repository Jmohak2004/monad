# Ghar indexer (Envio HyperIndex)

Indexes `ClaimEscrow`'s `Created`, `Claimed`, and `Refunded` events into two
entities, which back the app's Activity feed:

- `Transfer`: one per claim link (id = claim-key address), with status `PENDING` / `CLAIMED` / `REFUNDED`, sender, recipient, and timestamps
- `Account`: per-address totals for sent, received, and refunded amounts

Addresses are stored lowercase (`address_format: lowercase`).

## Run

Requires Node 22.15+ and Docker.

```bash
npm install          # .npmrc sets legacy-peer-deps (avoids an npm 10 resolver bug)
cp .env.example .env # set ENVIO_ESCROW_ADDRESS (+ ENVIO_API_TOKEN for HyperSync)
npm run codegen
npm test             # simulated events, no Docker needed
npm run dev          # Monad testnet via HyperSync; GraphQL at http://localhost:8080/v1/graphql
npm run dev:local    # local Hardhat node instead (config.local.yaml)
```

If port 8080 is taken, set `HASURA_EXTERNAL_PORT=8081` and point
`NEXT_PUBLIC_ENVIO_GRAPHQL_URL` at it.

## Query used by the app

```graphql
query History($addr: String!) {
  Transfer(
    where: { _or: [{ sender: { _eq: $addr } }, { recipient: { _eq: $addr } }] }
    order_by: { createdAt: desc }
    limit: 50
  ) { id sender recipient amount expiry status createdAt }
}
```
