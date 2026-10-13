// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Testnet stand-in for AUSD (6 decimals) with an open faucet.
///         Not for mainnet: on mainnet, point the escrow at real AUSD.
contract MockAUSD is ERC20 {
    uint256 public constant FAUCET_MAX = 1_000e6;

    error FaucetLimit();

    constructor() ERC20("Mock Agora USD", "AUSD") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function faucet(address to, uint256 amount) external {
        if (amount > FAUCET_MAX) revert FaucetLimit();
        _mint(to, amount);
    }
}
