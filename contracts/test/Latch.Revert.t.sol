// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Latch} from "../Latch.sol";
import {LatchTestBase} from "./Latch.Base.t.sol";

/// Every revert path of createHold / capture / refundExpired.
contract LatchRevertTest is LatchTestBase {
    // ---------------------------------------------------------- createHold
    function test_RevertCreate_ZeroRecipient() public {
        vm.prank(payer);
        vm.expectRevert(Latch.InvalidRecipient.selector);
        latch.createHold(address(0), 100, T0 + TTL);
    }

    function test_RevertCreate_RecipientIsPayer() public {
        vm.prank(payer);
        vm.expectRevert(Latch.InvalidRecipient.selector);
        latch.createHold(payer, 100, T0 + TTL);
    }

    function test_RevertCreate_ZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(Latch.ZeroAmount.selector);
        latch.createHold(recipient, 0, T0 + TTL);
    }

    function test_RevertCreate_ExpiryInPast() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.InvalidExpiry.selector, T0 - 1));
        latch.createHold(recipient, 100, T0 - 1);
    }

    function test_RevertCreate_ExpiryEqualsNow() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.InvalidExpiry.selector, T0));
        latch.createHold(recipient, 100, T0);
    }

    function test_RevertCreate_ExpiryZero() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.InvalidExpiry.selector, 0));
        latch.createHold(recipient, 100, 0);
    }

    function test_RevertCreate_InsufficientAllowance() public {
        address p = makeAddr("lowAllowance");
        usdc.mint(p, 1_000);
        vm.startPrank(p);
        usdc.approve(address(latch), 99);
        vm.expectRevert(bytes("MockERC20: allowance"));
        latch.createHold(recipient, 100, T0 + TTL);
        vm.stopPrank();
        assertEq(latch.holdCount(), 0);
    }

    function test_RevertCreate_NoAllowance() public {
        address p = makeAddr("noAllowance");
        usdc.mint(p, 1_000);
        vm.prank(p);
        vm.expectRevert(bytes("MockERC20: allowance"));
        latch.createHold(recipient, 100, T0 + TTL);
    }

    function test_RevertCreate_InsufficientBalance() public {
        address p = makeAddr("poor");
        usdc.mint(p, 99);
        vm.startPrank(p);
        usdc.approve(address(latch), type(uint256).max);
        vm.expectRevert(bytes("MockERC20: balance"));
        latch.createHold(recipient, 100, T0 + TTL);
        vm.stopPrank();
        assertEq(latch.holdCount(), 0);
        assertEq(usdc.balanceOf(p), 99);
    }

    // ------------------------------------------------------------- capture
    function test_RevertCapture_UnknownHold() public {
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.UnknownHold.selector, 1));
        latch.capture(1, 100);

        uint256 id = _createDefault();
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.UnknownHold.selector, id + 1));
        latch.capture(id + 1, 100);

        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.UnknownHold.selector, 0));
        latch.capture(0, 100);
    }

    function test_RevertCapture_ByPayer() public {
        uint256 id = _createDefault();
        vm.prank(payer);
        vm.expectRevert(Latch.NotRecipient.selector);
        latch.capture(id, 100);
    }

    function test_RevertCapture_ByRandomAddress() public {
        uint256 id = _createDefault();
        vm.prank(stranger);
        vm.expectRevert(Latch.NotRecipient.selector);
        latch.capture(id, 100);
    }

    function test_RevertCapture_ByRecipientOfOtherHold() public {
        uint256 id = _createDefault();
        _create(payer2, recipient2, 100, T0 + TTL);
        vm.prank(recipient2);
        vm.expectRevert(Latch.NotRecipient.selector);
        latch.capture(id, 100);
    }

    function test_RevertCapture_ZeroAmount() public {
        uint256 id = _createDefault();
        vm.prank(recipient);
        vm.expectRevert(Latch.ZeroAmount.selector);
        latch.capture(id, 0);
    }

    function test_RevertCapture_OverRemainingSingle() public {
        uint256 id = _createDefault();
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.AmountExceedsRemaining.selector, 20_001, 20_000));
        latch.capture(id, 20_001);
    }

    function test_RevertCapture_OverRemainingCumulative() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 15_000);
        _capture(recipient, id, 4_000);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.AmountExceedsRemaining.selector, 1_001, 1_000));
        latch.capture(id, 1_001);
        // exact remainder still works
        _capture(recipient, id, 1_000);
        assertEq(usdc.balanceOf(recipient), 20_000);
    }

    function test_RevertCapture_OverRemainingDoesNotUseOtherHoldsFunds() public {
        uint256 id = _create(payer, recipient, 100, T0 + TTL);
        _create(payer2, recipient, 10_000, T0 + TTL); // Latch holds plenty of USDC overall
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.AmountExceedsRemaining.selector, 101, 100));
        latch.capture(id, 101);
    }

    function test_RevertCapture_AtExactlyExpiry() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldExpired.selector, T0 + TTL));
        latch.capture(id, 100);
    }

    function test_RevertCapture_AfterExpiry() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL + 1000);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldExpired.selector, T0 + TTL));
        latch.capture(id, 100);
    }

    function test_RevertCapture_AfterFullCapture() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 20_000);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
        latch.capture(id, 1);
    }

    function test_RevertCapture_AfterRefund() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        _refund(payer, id);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
        latch.capture(id, 1);
    }

    function test_RevertCapture_AfterPartialCaptureAndRefund() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 10_000);
        vm.warp(T0 + TTL);
        _refund(payer, id);
        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
        latch.capture(id, 1);
        assertEq(usdc.balanceOf(recipient), 10_000);
    }

    // -------------------------------------------------------------- refund
    function test_RevertRefund_UnknownHold() public {
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.UnknownHold.selector, 5));
        latch.refundExpired(5);
    }

    function test_RevertRefund_BeforeExpiry() public {
        uint256 id = _createDefault();
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotExpired.selector, T0 + TTL));
        latch.refundExpired(id);
    }

    function test_RevertRefund_OneSecondBeforeExpiry() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL - 1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotExpired.selector, T0 + TTL));
        latch.refundExpired(id);
    }

    function test_RevertRefund_ByRecipient() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        vm.prank(recipient);
        vm.expectRevert(Latch.NotPayer.selector);
        latch.refundExpired(id);
    }

    function test_RevertRefund_ByRandomAddress() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        vm.prank(stranger);
        vm.expectRevert(Latch.NotPayer.selector);
        latch.refundExpired(id);
    }

    function test_RevertRefund_ByOtherPayer() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        vm.prank(payer2);
        vm.expectRevert(Latch.NotPayer.selector);
        latch.refundExpired(id);
    }

    function test_RevertRefund_NonPayerBeforeExpiryHitsNotPayerFirst() public {
        uint256 id = _createDefault();
        vm.prank(stranger);
        vm.expectRevert(Latch.NotPayer.selector);
        latch.refundExpired(id);
    }

    function test_RevertRefund_Double() public {
        uint256 id = _createDefault();
        vm.warp(T0 + TTL);
        _refund(payer, id);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
        latch.refundExpired(id);
        assertEq(usdc.balanceOf(address(latch)), 0);
    }

    function test_RevertRefund_FullyCapturedHold() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 20_000);
        vm.warp(T0 + TTL);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
        latch.refundExpired(id);
    }

    function test_RevertRefund_DoubleAfterPartialCapture() public {
        uint256 id = _createDefault();
        _capture(recipient, id, 10_000);
        vm.warp(T0 + TTL);
        _refund(payer, id);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
        latch.refundExpired(id);
    }
}
