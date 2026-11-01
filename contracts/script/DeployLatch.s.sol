// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Latch} from "../Latch.sol";

/// @notice Deploys Latch to Arc (mainnet or testnet). Latch has no constructor arguments,
///         owner or admin, so the deployer has no special rights afterwards.
/// @dev Pre-flight checks run BEFORE anything is broadcast and abort the script on a mismatch:
///      - the RPC must report Arc Mainnet (5042) or Arc Testnet (5042002),
///      - the Arc USDC ERC-20 interface must exist at the hardcoded address and report 6 decimals.
///      Sign with a Foundry keystore (`--account`) or a hardware wallet. Never pass a raw key.
///      See docs/DEPLOYMENT.md for the exact commands.
contract DeployLatch is Script {
    uint256 internal constant ARC_MAINNET_CHAIN_ID = 5042;
    uint256 internal constant ARC_TESTNET_CHAIN_ID = 5042002;
    address internal constant ARC_USDC = 0x3600000000000000000000000000000000000000;
    uint8 internal constant USDC_DECIMALS = 6;

    error UnsupportedChain(uint256 chainId);
    error UsdcNotFound(address usdc);
    error UnexpectedUsdcDecimals(uint8 decimals);
    error LatchUsdcMismatch(address expected, address actual);

    function run() external returns (Latch latch) {
        if (block.chainid != ARC_MAINNET_CHAIN_ID && block.chainid != ARC_TESTNET_CHAIN_ID) {
            revert UnsupportedChain(block.chainid);
        }
        if (ARC_USDC.code.length == 0) revert UsdcNotFound(ARC_USDC);
        uint8 decimals = IERC20Metadata(ARC_USDC).decimals();
        if (decimals != USDC_DECIMALS) revert UnexpectedUsdcDecimals(decimals);

        vm.startBroadcast();
        latch = new Latch();
        vm.stopBroadcast();

        if (address(latch.USDC()) != ARC_USDC) revert LatchUsdcMismatch(ARC_USDC, address(latch.USDC()));

        console.log("Network:", block.chainid == ARC_MAINNET_CHAIN_ID ? "Arc Mainnet" : "Arc Testnet");
        console.log("Chain ID:", block.chainid);
        console.log("Latch deployed at:", address(latch));
        console.log("USDC (6 decimals):", address(latch.USDC()));
        console.log("Record the deployment block from the transaction receipt (cast receipt <txHash> blockNumber).");
    }
}
