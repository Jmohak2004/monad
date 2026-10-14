import { defineChain, type Address } from "viem";
import { hardhat, monad, monadTestnet } from "viem/chains";

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 10143);
const baseChain = chainId === monad.id ? monad : chainId === hardhat.id ? { ...hardhat, testnet: true } : monadTestnet;

export const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || baseChain.rpcUrls.default.http[0];

export const chain = defineChain({
  ...baseChain,
  rpcUrls: { default: { http: [rpcUrl] } },
});

export const escrowAddress = (process.env.NEXT_PUBLIC_ESCROW_ADDRESS || undefined) as Address | undefined;
export const tokenAddress = (process.env.NEXT_PUBLIC_TOKEN_ADDRESS || undefined) as Address | undefined;
export const requestsAddress = (process.env.NEXT_PUBLIC_REQUESTS_ADDRESS || undefined) as Address | undefined;
export const tokenIsMock = process.env.NEXT_PUBLIC_TOKEN_IS_MOCK !== "false";
export const envioUrl = process.env.NEXT_PUBLIC_ENVIO_GRAPHQL_URL || undefined;
/** AUSD uses 6 decimals. */
export const TOKEN_DECIMALS = 6;
/** Unclaimed links can be refunded after this many days. */
export const LINK_EXPIRY_DAYS = 7;
/** Request QRs stop being payable after this many days. */
export const REQUEST_EXPIRY_DAYS = 7;

export const isConfigured = Boolean(escrowAddress && tokenAddress);
export const requestsConfigured = Boolean(requestsAddress && tokenAddress);

export const explorerTx = (hash: string) => `${chain.blockExplorers?.default.url ?? ""}/tx/${hash}`;
