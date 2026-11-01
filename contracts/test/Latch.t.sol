// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Latch} from "../Latch.sol";
import {LatchTestBase} from "./Latch.Base.t.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// Deployment, happy paths, events, demo flow, token-quirk handling.
contract LatchTest is LatchTestBase {
    // ---------------------------------------------------------------- deploy
    function test_Deploy_InitialState() public view {
        assertEq(latch.holdCount(), 0);
        assertEq(address(latch.USDC()), USDC_ADDR);
        assertEq(usdc.decimals(), 6);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    // ---------------------------------------------------------- createHold
    function test_CreateHold_StateAndBalances() public {
        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 id = _createDefault();

        assertEq(id, 1);
        assertEq(latch.holdCount(), 1);

        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.payer, payer);
        assertEq(h.recipient, recipient);
        assertEq(h.deposited, 20_000);
        assertEq(h.captured, 0);
        assertEq(h.refunded, 0);
        assertEq(h.expiry, T0 + TTL);
        assertEq(uint8(h.status), uint8(Latch.Status.Active));
        assertEq(latch.remaining(id), 20_000);

        assertEq(usdc.balanceOf(payer), payerBefore - 20_000);
        assertEq(usdc.balanceOf(address(latch)), 20_000);
    }

    function test_CreateHold_EmitsHoldCreated() public {
        vm.expectEmit(true, true, true, true, address(latch));
        emit Latch.HoldCreated(1, payer, recipient, 20_000, T0 + TTL);
        _createDefault();
    }

    function test_CreateHold_SequentialIdsStartAtOne() public {
        uint256 a = _create(payer, recipient, 1, T0 + 10);
        uint256 b = _create(payer2, recipient2, 2, T0 + 20);
        uint256 c = _create(payer, recipient2, 3, T0 + 30);
        assertEq(a, 1);
        assertEq(b, 2);
        assertEq(c, 3);
        assertEq(latch.holdCount(), 3);
        assertEq(latch.getHold(b).payer, payer2);
        assertEq(usdc.balanceOf(address(latch)), 6);
    }

    function test_CreateHold_ExpiryOneSecondInFutureAllowed() public {
        uint256 id = _create(payer, recipient, 5, T0 + 1);
        assertEq(latch.getHold(id).expiry, T0 + 1);
    }

    function test_CreateHold_ExactBalanceAndAllowance() public {
        address p = makeAddr("exact");
        usdc.mint(p, 777);
        vm.startPrank(p);
        usdc.approve(address(latch), 777);
        latch.createHold(recipient, 777, T0 + 1);
        vm.stopPrank();
        assertEq(usdc.balanceOf(p), 0);
        assertEq(usdc.allowance(p, address(latch)), 0);
    }

    // ------------------------------------------------------------- capture
    function test_Capture_FullCaptureSetsCaptured() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 20_000);

        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.captured, 20_000);
        assertEq(h.refunded, 0);
        assertEq(uint8(h.status), uint8(Latch.Status.Captured));
        assertEq(latch.remaining(id), 0);
        assertEq(usdc.balanceOf(recipient), 20_000);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    function test_Capture_EmitsCaptured() public {
        uint256 id = _createDefault();
        vm.expectEmit(true, true, false, true, address(latch));
        emit Latch.Captured(id, recipient, 5_000, 15_000);
        _capture(recipient, id, 5_000);

        vm.expectEmit(true, true, false, true, address(latch));
        emit Latch.Captured(id, recipient, 15_000, 0);
        _capture(recipient, id, 15_000);
    }

    function test_Capture_PartialKeepsActive() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 10_000);
        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.captured, 10_000);
        assertEq(uint8(h.status), uint8(Latch.Status.Active));
        assertEq(latch.remaining(id), 10_000);
        assertEq(usdc.balanceOf(recipient), 10_000);
        assertEq(usdc.balanceOf(address(latch)), 10_000);
    }

    function test_Capture_MultiplePartialsThenFinalSetsCaptured() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 3_000);
        assertEq(latch.remaining(id), 17_000);
        _capture(recipient, id, 7_000);
        assertEq(latch.remaining(id), 10_000);
        assertEq(uint8(latch.getHold(id).status), uint8(Latch.Status.Active));
        _capture(recipient, id, 1);
        assertEq(latch.remaining(id), 9_999);
        _capture(recipient, id, 9_999);

        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.captured, 20_000);
        assertEq(uint8(h.status), uint8(Latch.Status.Captured));
        assertEq(latch.remaining(id), 0);
        assertEq(usdc.balanceOf(recipient), 20_000);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    function test_Capture_OneSecondBeforeExpiryAllowed() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL - 1);
        _capture(recipient, id, 20_000);
        assertEq(usdc.balanceOf(recipient), 20_000);
    }

    function test_Capture_HoldsAreIndependent() public {
        uint256 a = _create(payer, recipient, 100, T0 + TTL);
        uint256 b = _create(payer2, recipient2, 200, T0 + TTL);
        _capture(recipient, a, 40);
        assertEq(latch.remaining(a), 60);
        assertEq(latch.remaining(b), 200);
        assertEq(usdc.balanceOf(recipient2), 0);
    }

    // -------------------------------------------------------------- refund
    function test_Refund_AtExactlyExpiryAllowed() public {
        uint256 id = _createDefault();
        uint256 before_ = usdc.balanceOf(payer);
        vm.warp(T0 + TTL);
        _refund(payer, id);
        assertEq(usdc.balanceOf(payer), before_ + 20_000);
    }

    function test_Refund_FullAmountWhenNothingCaptured() public {
        uint256 id = _createDefault();
        uint256 start = usdc.balanceOf(payer) + 20_000;
        vm.warp(T0 + TTL + 1);

        vm.expectEmit(true, true, false, true, address(latch));
        emit Latch.Refunded(id, payer, 20_000);
        _refund(payer, id);

        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.refunded, 20_000);
        assertEq(h.captured, 0);
        assertEq(uint8(h.status), uint8(Latch.Status.Refunded));
        assertEq(latch.remaining(id), 0);
        assertEq(usdc.balanceOf(payer), start);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    /// Exact demo flow: reserve 0.02 USDC, capture 0.01, expire, refund the remaining 0.01.
    function test_DemoFlow_ReserveCapturePartialThenRefundRemainder() public {
        uint256 payerStart = usdc.balanceOf(payer);

        uint256 id = _create(payer, recipient, 20_000, T0 + 1 hours);
        assertEq(usdc.balanceOf(address(latch)), 20_000);
        assertEq(usdc.balanceOf(payer), payerStart - 20_000);

        _capture(recipient, id, 10_000);
        assertEq(usdc.balanceOf(recipient), 10_000);
        assertEq(latch.remaining(id), 10_000);
        assertEq(uint8(latch.getHold(id).status), uint8(Latch.Status.Active));

        vm.warp(T0 + 1 hours + 1);
        // expiry alone does not change stored status
        assertEq(uint8(latch.getHold(id).status), uint8(Latch.Status.Active));

        vm.expectEmit(true, true, false, true, address(latch));
        emit Latch.Refunded(id, payer, 10_000);
        _refund(payer, id);

        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.deposited, 20_000);
        assertEq(h.captured, 10_000);
        assertEq(h.refunded, 10_000);
        assertEq(uint8(h.status), uint8(Latch.Status.Refunded));
        assertEq(latch.remaining(id), 0);

        assertEq(usdc.balanceOf(payer), payerStart - 10_000);
        assertEq(usdc.balanceOf(recipient), 10_000);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    // ---------------------------------------------------------------- views
    function test_Views_RevertOnUnknownHold() public {
        vm.expectRevert(abi.encodeWithSelector(Latch.UnknownHold.selector, 1));
        latch.getHold(1);
        vm.expectRevert(abi.encodeWithSelector(Latch.UnknownHold.selector, 0));
        latch.remaining(0);
    }

    // ------------------------------------------- token quirks / reentrancy
    function test_CreateHold_RevertsOnFeeOnTransferToken() public {
        usdc.setFeeBps(100); // 1% burned -> latch receives less than `amount`
        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(Latch.UnexpectedDepositBalance.selector, 0, 19_800, 20_000)
        );
        latch.createHold(recipient, 20_000, T0 + TTL);

        // whole operation (incl. allocated ID and hold record) rolled back
        assertEq(latch.holdCount(), 0);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    function test_Reentrancy_TokenHookCannotReenterCapture() public {
        uint256 id = _createDefault();
        // During the latch's token transfer on capture, the token calls back latch.capture.
        usdc.setHook(address(latch), abi.encodeCall(Latch.capture, (id, 1)));
        vm.prank(recipient);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        latch.capture(id, 1_000);
        assertEq(latch.remaining(id), 20_000);
    }

    function test_Reentrancy_TokenHookCannotReenterCreateHold() public {
        usdc.setHook(address(latch), abi.encodeCall(Latch.createHold, (recipient, 1, T0 + TTL)));
        vm.prank(payer);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        latch.createHold(recipient, 100, T0 + TTL);
        assertEq(latch.holdCount(), 0);
    }

    function test_Reentrancy_TokenHookCannotReenterRefund() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        usdc.setHook(address(latch), abi.encodeCall(Latch.refundExpired, (id)));
        vm.prank(payer);
        vm.expectRevert(ReentrancyGuard.ReentrancyGuardReentrantCall.selector);
        latch.refundExpired(id);
        assertEq(latch.remaining(id), 20_000);
    }
}
