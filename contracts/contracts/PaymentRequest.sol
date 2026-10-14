// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PaymentRequest
/// @notice One-time payment requests ("I need $200"). The payee signs an invoice off-chain
///         and shares it as a QR. Anyone holding it can pay it once, before expiry,
///         straight from their balance to the payee. The payee can cancel it on-chain.
contract PaymentRequest is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        Open,
        Paid,
        Cancelled
    }

    IERC20 public immutable token;

    /// @notice Keyed by payee so nobody else can cancel (or squat) a payee's request id.
    mapping(address payee => mapping(bytes32 id => Status)) public status;

    event RequestPaid(bytes32 indexed id, address indexed payee, address indexed payer, uint256 amount);
    event RequestCancelled(bytes32 indexed id, address indexed payee);

    error ZeroAmount();
    error ZeroAddress();
    error NotOpen();
    error Expired();
    error BadSignature();

    constructor(IERC20 token_) {
        if (address(token_) == address(0)) revert ZeroAddress();
        token = token_;
    }

    /// @notice Pay `payee`'s signed request. Caller must have approved this contract for `amount`.
    /// @param signature The payee's EIP-191 signature over `requestDigest(payee, amount, id, expiry)`.
    function pay(address payee, uint256 amount, bytes32 id, uint40 expiry, bytes calldata signature)
        external
        nonReentrant
    {
        if (payee == address(0)) revert ZeroAddress();
        if (amount == 0) revert ZeroAmount();
        if (status[payee][id] != Status.Open) revert NotOpen();
        if (block.timestamp > expiry) revert Expired();

        bytes32 digest = MessageHashUtils.toEthSignedMessageHash(requestDigest(payee, amount, id, expiry));
        if (ECDSA.recover(digest, signature) != payee) revert BadSignature();

        status[payee][id] = Status.Paid;
        token.safeTransferFrom(msg.sender, payee, amount);
        emit RequestPaid(id, payee, msg.sender, amount);
    }

    /// @notice Kill one of your own open requests, even if someone saved the QR.
    function cancel(bytes32 id) external {
        if (status[msg.sender][id] != Status.Open) revert NotOpen();
        status[msg.sender][id] = Status.Cancelled;
        emit RequestCancelled(id, msg.sender);
    }

    /// @notice The raw 32-byte message the payee signs (before the EIP-191 prefix).
    /// @dev Binds the invoice to this contract, this chain, one payee, one amount, and one expiry.
    function requestDigest(address payee, uint256 amount, bytes32 id, uint40 expiry) public view returns (bytes32) {
        return keccak256(abi.encode(address(this), block.chainid, payee, amount, id, expiry));
    }
}
