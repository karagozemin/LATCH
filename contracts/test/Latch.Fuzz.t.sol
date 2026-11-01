// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Latch} from "../Latch.sol";
import {LatchTestBase} from "./Latch.Base.t.sol";

/// Fuzz tests of accounting + token conservation.
contract LatchFuzzTest is LatchTestBase {
    uint256 internal constant MAX_AMT = 100e6;

    function _assertHoldIdentity(uint256 id) internal view {
        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.deposited, h.captured + h.refunded + latch.remaining(id), "deposited != c + r + remaining");
    }

    function testFuzz_CreateHold_StoresInputsAndEscrows(address to, uint256 amount, uint256 ttl) public {
        vm.assume(to != address(0) && to != payer);
        amount = bound(amount, 1, MAX_AMT);
        ttl = bound(ttl, 1, 365 days);

        uint256 payerBefore = usdc.balanceOf(payer);
        uint256 id = _create(payer, to, amount, T0 + ttl);

        Latch.Hold memory h = latch.getHold(id);
        assertEq(h.payer, payer);
        assertEq(h.recipient, to);
        assertEq(h.deposited, amount);
        assertEq(h.expiry, T0 + ttl);
        assertEq(latch.remaining(id), amount);
        assertEq(usdc.balanceOf(payer), payerBefore - amount);
        assertEq(usdc.balanceOf(address(latch)), amount);
    }

    function testFuzz_CreateHold_PastOrCurrentExpiryReverts(uint256 expiry) public {
        expiry = bound(expiry, 0, T0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Latch.InvalidExpiry.selector, expiry));
        latch.createHold(recipient, 1, expiry);
    }

    /// Sequence of partial captures, then (optionally) refund of the remainder.
    function testFuzz_CaptureSequenceThenRefund_Conserves(
        uint256 amount,
        uint256[4] memory capSeeds,
        uint256 ttl
    ) public {
        amount = bound(amount, 1, MAX_AMT);
        ttl = bound(ttl, 2, 30 days);
        uint256 expiry = T0 + ttl;
        uint256 payerStart = usdc.balanceOf(payer);
        uint256 id = _create(payer, recipient, amount, expiry);

        uint256 capturedSum;
        for (uint256 i = 0; i < 4; i++) {
            uint256 rem = latch.remaining(id);
            if (rem == 0) break;
            uint256 amt = bound(capSeeds[i], 1, rem);
            _capture(recipient, id, amt);
            capturedSum += amt;
            assertEq(latch.remaining(id), amount - capturedSum);
            assertEq(usdc.balanceOf(address(latch)), amount - capturedSum);
            _assertHoldIdentity(id);
        }

        uint256 rem2 = latch.remaining(id);
        Latch.Hold memory h = latch.getHold(id);
        assertEq(uint8(h.status), rem2 == 0 ? uint8(Latch.Status.Captured) : uint8(Latch.Status.Active));

        vm.warp(expiry);
        if (rem2 > 0) {
            _refund(payer, id);
            assertEq(uint8(latch.getHold(id).status), uint8(Latch.Status.Refunded));
        } else {
            vm.prank(payer);
            vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotActive.selector, id));
            latch.refundExpired(id);
        }

        _assertHoldIdentity(id);
        assertEq(latch.remaining(id), 0);
        assertEq(usdc.balanceOf(address(latch)), 0);
        assertEq(usdc.balanceOf(recipient), capturedSum);
        assertEq(usdc.balanceOf(payer), payerStart - capturedSum);
        assertEq(latch.getHold(id).refunded, rem2);
    }

    function testFuzz_Capture_AnyAmountAboveRemainingReverts(uint256 amount, uint256 first, uint256 extra) public {
        amount = bound(amount, 1, MAX_AMT);
        uint256 id = _create(payer, recipient, amount, T0 + TTL);
        first = bound(first, 0, amount - 1);
        if (first > 0) _capture(recipient, id, first);
        uint256 rem = amount - first;
        extra = bound(extra, 1, type(uint128).max);

        vm.prank(recipient);
        vm.expectRevert(abi.encodeWithSelector(Latch.AmountExceedsRemaining.selector, rem + extra, rem));
        latch.capture(id, rem + extra);
    }

    function testFuzz_Capture_TimeWindow(uint256 ts) public {
        uint256 id = _createDefault();
        ts = bound(ts, T0, T0 + 10 * TTL);
        vm.warp(ts);
        if (ts < T0 + TTL) {
            _capture(recipient, id, 1);
            vm.prank(payer);
            vm.expectRevert(abi.encodeWithSelector(Latch.HoldNotExpired.selector, T0 + TTL));
            latch.refundExpired(id);
        } else {
            vm.prank(recipient);
            vm.expectRevert(abi.encodeWithSelector(Latch.HoldExpired.selector, T0 + TTL));
            latch.capture(id, 1);
            _refund(payer, id);
        }
    }

    function testFuzz_Unauthorized_NeverCaptureOrRefund(address who, uint256 amt) public {
        uint256 id = _createDefault();
        vm.assume(who != recipient && who != payer);
        amt = bound(amt, 1, 20_000);

        vm.prank(who);
        vm.expectRevert(Latch.NotRecipient.selector);
        latch.capture(id, amt);

        vm.warp(T0 + TTL);
        vm.prank(who);
        vm.expectRevert(Latch.NotPayer.selector);
        latch.refundExpired(id);
        assertEq(usdc.balanceOf(address(latch)), 20_000);
    }

    /// Latch USDC balance == sum of remaining across all holds; deposits == captured + refunded + remaining.
    function testFuzz_MultiHold_BalanceEqualsSumRemaining(
        uint256[5] memory amounts,
        uint256[5] memory ttls,
        uint256[5] memory caps,
        uint256 warpTo
    ) public {
        uint256 totalDeposited;
        uint256 n = 5;
        for (uint256 i = 0; i < n; i++) {
            address p = i % 2 == 0 ? payer : payer2;
            address r = i % 3 == 0 ? recipient : recipient2;
            uint256 a = bound(amounts[i], 1, MAX_AMT);
            _create(p, r, a, T0 + bound(ttls[i], 1, 10 days));
            totalDeposited += a;
        }
        assertEq(usdc.balanceOf(address(latch)), totalDeposited);

        warpTo = bound(warpTo, 0, 10 days);
        // capture on each hold while it is still capturable
        uint256 totalCaptured;
        vm.warp(T0 + warpTo);
        for (uint256 id = 1; id <= n; id++) {
            Latch.Hold memory h = latch.getHold(id);
            uint256 rem = latch.remaining(id);
            if (block.timestamp < h.expiry && rem > 0) {
                uint256 amt = bound(caps[id - 1], 1, rem);
                _capture(h.recipient, id, amt);
                totalCaptured += amt;
            }
        }
        // refund what is refundable
        uint256 totalRefunded;
        for (uint256 id = 1; id <= n; id++) {
            Latch.Hold memory h = latch.getHold(id);
            uint256 rem = latch.remaining(id);
            if (block.timestamp >= h.expiry && rem > 0) {
                _refund(h.payer, id);
                totalRefunded += rem;
            }
        }

        uint256 sumRemaining;
        uint256 sumCaptured;
        uint256 sumRefunded;
        uint256 sumDeposited;
        for (uint256 id = 1; id <= n; id++) {
            Latch.Hold memory h = latch.getHold(id);
            _assertHoldIdentity(id);
            sumRemaining += latch.remaining(id);
            sumCaptured += h.captured;
            sumRefunded += h.refunded;
            sumDeposited += h.deposited;
        }
        assertEq(usdc.balanceOf(address(latch)), sumRemaining);
        assertEq(sumDeposited, totalDeposited);
        assertEq(sumCaptured, totalCaptured);
        assertEq(sumRefunded, totalRefunded);
        assertEq(sumDeposited, sumCaptured + sumRefunded + sumRemaining);
        assertEq(usdc.balanceOf(recipient) + usdc.balanceOf(recipient2), totalCaptured);
    }
}
