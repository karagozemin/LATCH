// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test, console2} from "forge-std/Test.sol";
import {Latch} from "../Latch.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {LatchTestBase} from "./Latch.Base.t.sol";

/// Handler: bounded random actions by multiple payers/recipients over many holds.
contract LatchHandler is Test {
    Latch public latch;
    MockERC20 public usdc;

    address[] public payers;
    address[] public recipients;

    uint256 public ghostDeposited;
    uint256 public ghostCaptured;
    uint256 public ghostRefunded;
    uint256 public initialSupply;
    bool public unauthorizedSucceeded;

    uint256 public nCreate;
    uint256 public nCapture;
    uint256 public nRefund;
    uint256 public nDenied;

    constructor(Latch _latch, MockERC20 _usdc) {
        latch = _latch;
        usdc = _usdc;
        for (uint256 i = 0; i < 3; i++) {
            address p = makeAddr(string.concat("hPayer", vm.toString(i)));
            address r = makeAddr(string.concat("hRecipient", vm.toString(i)));
            payers.push(p);
            recipients.push(r);
            usdc.mint(p, 1e12);
            vm.prank(p);
            usdc.approve(address(latch), type(uint256).max);
        }
        initialSupply = usdc.totalSupply();
    }

    function actorsLength() external view returns (uint256) {
        return payers.length;
    }

    function create(uint256 pSeed, uint256 rSeed, uint256 amount, uint256 ttl) external {
        address p = payers[pSeed % payers.length];
        address r = recipients[rSeed % recipients.length];
        amount = bound(amount, 1, 1e9);
        ttl = bound(ttl, 1, 2 days);
        vm.prank(p);
        latch.createHold(r, amount, block.timestamp + ttl);
        ghostDeposited += amount;
        nCreate++;
    }

    function capture(uint256 idSeed, uint256 amount) external {
        uint256 n = latch.holdCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        Latch.Hold memory h = latch.getHold(id);
        uint256 rem = latch.remaining(id);
        if (h.status != Latch.Status.Active || block.timestamp >= h.expiry || rem == 0) return;
        amount = bound(amount, 1, rem);
        vm.prank(h.recipient);
        latch.capture(id, amount);
        ghostCaptured += amount;
        nCapture++;
    }

    function refund(uint256 idSeed) external {
        uint256 n = latch.holdCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        Latch.Hold memory h = latch.getHold(id);
        uint256 rem = latch.remaining(id);
        if (h.status != Latch.Status.Active || block.timestamp < h.expiry || rem == 0) return;
        vm.prank(h.payer);
        latch.refundExpired(id);
        ghostRefunded += rem;
        nRefund++;
    }

    /// Calls that must never succeed: wrong caller, over-capture, out-of-window.
    function attemptIllegal(uint256 idSeed, uint256 actorSeed, uint256 amount) external {
        uint256 n = latch.holdCount();
        if (n == 0) return;
        uint256 id = bound(idSeed, 1, n);
        Latch.Hold memory h = latch.getHold(id);
        uint256 rem = latch.remaining(id);
        address who = actorSeed % 2 == 0 ? payers[actorSeed % 3] : recipients[actorSeed % 3];

        // non-recipient capture
        if (who != h.recipient) {
            vm.prank(who);
            try latch.capture(id, 1) {
                unauthorizedSucceeded = true;
            } catch {
                nDenied++;
            }
        }
        // non-payer refund
        if (who != h.payer) {
            vm.prank(who);
            try latch.refundExpired(id) {
                unauthorizedSucceeded = true;
            } catch {
                nDenied++;
            }
        }
        // overcapture by the true recipient
        vm.prank(h.recipient);
        try latch.capture(id, rem + 1 + bound(amount, 0, 1e6)) {
            unauthorizedSucceeded = true;
        } catch {
            nDenied++;
        }
        // early refund by true payer
        if (block.timestamp < h.expiry) {
            vm.prank(h.payer);
            try latch.refundExpired(id) {
                unauthorizedSucceeded = true;
            } catch {
                nDenied++;
            }
        }
        // late capture by true recipient
        if (block.timestamp >= h.expiry) {
            vm.prank(h.recipient);
            try latch.capture(id, 1) {
                unauthorizedSucceeded = true;
            } catch {
                nDenied++;
            }
        }
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 3 hours));
    }
}

contract LatchInvariantTest is LatchTestBase {
    LatchHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new LatchHandler(latch, usdc);
        targetContract(address(handler));
    }

    function _sumRemaining() internal view returns (uint256 s) {
        uint256 n = latch.holdCount();
        for (uint256 id = 1; id <= n; id++) {
            s += latch.remaining(id);
        }
    }

    /// Latch USDC balance == sum of remaining across all holds.
    function invariant_LatchBalanceEqualsSumRemaining() public view {
        assertEq(usdc.balanceOf(address(latch)), _sumRemaining());
    }

    /// deposited == captured + refunded + remaining (globally, vs. independent ghost totals).
    function invariant_GlobalConservation() public view {
        uint256 rem = _sumRemaining();
        assertEq(handler.ghostDeposited(), handler.ghostCaptured() + handler.ghostRefunded() + rem);
    }

    /// Per-hold identity and status consistency.
    function invariant_PerHoldAccounting() public view {
        uint256 n = latch.holdCount();
        uint256 sumC;
        uint256 sumR;
        for (uint256 id = 1; id <= n; id++) {
            Latch.Hold memory h = latch.getHold(id);
            uint256 rem = latch.remaining(id);
            assertEq(h.deposited, h.captured + h.refunded + rem);
            assertGt(h.deposited, 0);
            if (h.status == Latch.Status.Captured) {
                assertEq(rem, 0);
                assertEq(h.captured, h.deposited);
                assertEq(h.refunded, 0);
            } else if (h.status == Latch.Status.Refunded) {
                assertEq(rem, 0);
                assertEq(h.refunded > 0, true);
            } else {
                assertEq(h.refunded, 0);
                assertGt(rem, 0);
            }
            sumC += h.captured;
            sumR += h.refunded;
        }
        assertEq(sumC, handler.ghostCaptured());
        assertEq(sumR, handler.ghostRefunded());
    }

    /// Recipients hold exactly what was captured; total token supply is conserved among actors + Latch.
    function invariant_TokenConservation() public view {
        uint256 total = usdc.balanceOf(address(latch));
        uint256 recipientTotal;
        for (uint256 i = 0; i < handler.actorsLength(); i++) {
            total += usdc.balanceOf(handler.payers(i));
            recipientTotal += usdc.balanceOf(handler.recipients(i));
        }
        total += recipientTotal;
        assertEq(recipientTotal, handler.ghostCaptured());
        // handler.initialSupply() snapshots supply after minting handler actors (includes base payers)
        total += usdc.balanceOf(payer) + usdc.balanceOf(payer2);
        assertEq(total, handler.initialSupply());
        assertEq(usdc.totalSupply(), handler.initialSupply());
    }

    /// No unauthorized / out-of-window / over-capture call ever succeeded.
    function invariant_IllegalCallsNeverSucceed() public view {
        assertFalse(handler.unauthorizedSucceeded());
    }

    function invariant_HoldCountMatchesCreates() public view {
        assertEq(latch.holdCount(), handler.nCreate());
    }

    function afterInvariant() public view {
        console2.log("creates", handler.nCreate());
        console2.log("captures", handler.nCapture());
        console2.log("refunds", handler.nRefund());
        console2.log("denied", handler.nDenied());
    }
}
