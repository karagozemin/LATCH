// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script} from "forge-std/Script.sol";
import {Latch} from "../Latch.sol";

/// @notice Deploys Latch. Latch has no constructor arguments, owner or admin.
/// @dev Sign with a Foundry keystore (`--account`) or hardware wallet, never a raw key flag.
///      See docs/DEPLOYMENT.md.
contract DeployLatch is Script {
    function run() external returns (Latch latch) {
        vm.startBroadcast();
        latch = new Latch();
        vm.stopBroadcast();
    }
}
