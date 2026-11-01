// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Latch} from "../Latch.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

abstract contract LatchTestBase is Test {
    address internal constant USDC_ADDR = 0x3600000000000000000000000000000000000000;
    uint256 internal constant T0 = 1_700_000_000;
    uint256 internal constant TTL = 1 days;

    Latch internal latch;
    MockERC20 internal usdc;

    address internal payer = makeAddr("payer");
    address internal payer2 = makeAddr("payer2");
    address internal recipient = makeAddr("recipient");
    address internal recipient2 = makeAddr("recipient2");
    address internal stranger = makeAddr("stranger");

    function setUp() public virtual {
        vm.warp(T0);
        MockERC20 impl = new MockERC20();
        vm.etch(USDC_ADDR, address(impl).code);
        usdc = MockERC20(USDC_ADDR);

        latch = new Latch();

        usdc.mint(payer, 1_000e6);
        usdc.mint(payer2, 1_000e6);
        vm.prank(payer);
        usdc.approve(address(latch), type(uint256).max);
        vm.prank(payer2);
        usdc.approve(address(latch), type(uint256).max);
    }

    function _create(address from, address to, uint256 amount, uint256 expiry) internal returns (uint256 id) {
        vm.prank(from);
        id = latch.createHold(to, amount, expiry);
    }

    /// @dev Default hold: payer -> recipient, 20000 base units, expires T0 + 1 day.
    function _createDefault() internal returns (uint256 id) {
        id = _create(payer, recipient, 20_000, T0 + TTL);
    }

    function _capture(address from, uint256 id, uint256 amount) internal {
        vm.prank(from);
        latch.capture(id, amount);
    }

    function _refund(address from, uint256 id) internal {
        vm.prank(from);
        latch.refundExpired(id);
    }
}
