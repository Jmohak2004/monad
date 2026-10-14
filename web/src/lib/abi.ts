// Hand-written to match contracts/contracts/ClaimEscrow.sol and MockAUSD.sol.

export const escrowAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "nonpayable",
    inputs: [
      { name: "amount", type: "uint256" },
      { name: "claimKey", type: "address" },
      { name: "expiry", type: "uint40" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "claimKey", type: "address" },
      { name: "recipient", type: "address" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "claimKey", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimDigest",
    stateMutability: "view",
    inputs: [
      { name: "claimKey", type: "address" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "transfers",
    stateMutability: "view",
    inputs: [{ name: "claimKey", type: "address" }],
    outputs: [
      { name: "sender", type: "address" },
      { name: "expiry", type: "uint40" },
      { name: "status", type: "uint8" },
      { name: "amount", type: "uint128" },
    ],
  },
  {
    type: "event",
    name: "Created",
    inputs: [
      { name: "claimKey", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "expiry", type: "uint40", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Claimed",
    inputs: [
      { name: "claimKey", type: "address", indexed: true },
      { name: "recipient", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Refunded",
    inputs: [
      { name: "claimKey", type: "address", indexed: true },
      { name: "sender", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  ...["ZeroAmount", "ZeroAddress", "AmountTooLarge", "BadExpiry", "ClaimKeyInUse", "NotPending", "Expired", "NotExpired", "NotSender", "BadSignature"].map(
    (name) => ({ type: "error", name, inputs: [] }) as const,
  ),
] as const;

// Matches contracts/contracts/PaymentRequest.sol.
export const requestsAbi = [
  {
    type: "function",
    name: "pay",
    stateMutability: "nonpayable",
    inputs: [
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "id", type: "bytes32" },
      { name: "expiry", type: "uint40" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "cancel",
    stateMutability: "nonpayable",
    inputs: [{ name: "id", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "status",
    stateMutability: "view",
    inputs: [
      { name: "payee", type: "address" },
      { name: "id", type: "bytes32" },
    ],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "event",
    name: "RequestPaid",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "RequestCancelled",
    inputs: [
      { name: "id", type: "bytes32", indexed: true },
      { name: "payee", type: "address", indexed: true },
    ],
  },
  ...["ZeroAmount", "ZeroAddress", "NotOpen", "Expired", "BadSignature"].map(
    (name) => ({ type: "error", name, inputs: [] }) as const,
  ),
] as const;

export enum RequestStatus {
  Open = 0,
  Paid = 1,
  Cancelled = 2,
}

export const tokenAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "faucet",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

export enum TransferStatus {
  None = 0,
  Pending = 1,
  Claimed = 2,
  Refunded = 3,
}
