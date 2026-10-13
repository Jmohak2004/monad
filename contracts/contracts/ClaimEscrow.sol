// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ClaimEscrow
/// @notice Link-based token transfers. The sender locks tokens against the address of
///         an ephemeral "claim key". Whoever holds the claim key's private key (shared
///         in a link fragment) can sign over a recipient address, and anyone, usually
///         a gas-paying relayer, can submit that signature to pay the recipient.
///         Unclaimed transfers can be refunded to the sender after expiry.
contract ClaimEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Pending,
        Claimed,
        Refunded
    }

    struct Transfer {
        address sender;
        uint40 expiry;
        Status status;
        uint128 amount;
    }

    /// @notice Longest expiry a sender may choose.
    uint256 public constant MAX_EXPIRY = 90 days;

    IERC20 public immutable token;

    /// @notice Transfers keyed by the claim key's address.
    mapping(address claimKey => Transfer) public transfers;

    event Created(address indexed claimKey, address indexed sender, uint256 amount, uint40 expiry);
    event Claimed(address indexed claimKey, address indexed recipient, address indexed sender, uint256 amount);
    event Refunded(address indexed claimKey, address indexed sender, uint256 amount);

    error ZeroAmount();
    error ZeroAddress();
    error AmountTooLarge();
    error BadExpiry();
    error ClaimKeyInUse();
    error NotPending();
    error Expired();
    error NotExpired();
    error NotSender();
    error BadSignature();

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    /// @notice Lock `amount` tokens claimable by whoever holds `claimKey`'s private key.
    /// @dev Caller must have approved this contract for `amount` first.
    function create(uint256 amount, address claimKey, uint40 expiry) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint128).max) revert AmountTooLarge();
        if (claimKey == address(0)) revert ZeroAddress();
        if (expiry <= block.timestamp || expiry > block.timestamp + MAX_EXPIRY) revert BadExpiry();
        if (transfers[claimKey].status != Status.None) revert ClaimKeyInUse();

        transfers[claimKey] =
            Transfer({sender: msg.sender, expiry: expiry, status: Status.Pending, amount: uint128(amount)});

        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Created(claimKey, msg.sender, amount, expiry);
    }

    /// @notice Pay out a pending transfer to `recipient`.
    /// @param signature The claim key's EIP-191 signature over `claimDigest(claimKey, recipient)`.
    function claim(address claimKey, address recipient, bytes calldata signature) external nonReentrant {
        if (recipient == address(0)) revert ZeroAddress();
        Transfer storage t = transfers[claimKey];
        if (t.status != Status.Pending) revert NotPending();
        if (block.timestamp > t.expiry) revert Expired();

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(claimDigest(claimKey, recipient));
        if (ECDSA.recover(digest, signature) != claimKey) revert BadSignature();

        t.status = Status.Claimed;
        uint256 amount = t.amount;
        token.safeTransfer(recipient, amount);
        emit Claimed(claimKey, recipient, t.sender, amount);
    }

    /// @notice Return an expired, unclaimed transfer to its sender.
    function refund(address claimKey) external nonReentrant {
        Transfer storage t = transfers[claimKey];
        if (t.status != Status.Pending) revert NotPending();
        if (msg.sender != t.sender) revert NotSender();
        if (block.timestamp <= t.expiry) revert NotExpired();

        t.status = Status.Refunded;
        uint256 amount = t.amount;
        token.safeTransfer(t.sender, amount);
        emit Refunded(claimKey, t.sender, amount);
    }

    /// @notice The raw 32-byte message the claim key signs (before the EIP-191 prefix).
    /// @dev Binds the signature to this contract, this chain, and one recipient.
    function claimDigest(address claimKey, address recipient) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, claimKey, recipient));
    }
}
