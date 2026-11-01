// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title Latch
 * @notice Immutable, prepaid USDC payment authorizations for Arc.
 * @dev Uses only the ERC-20 interface of Arc's official USDC, at the same address
 * on Arc testnet and mainnet. Amounts are in six-decimal base units (1 USDC = 1e6).
 * No native-currency payments, administrators, upgrades, fees, or cancellation.
 * Hold IDs start at 1. Enumerate IDs from 1 through holdCount(), or use events.
 * A recipient may capture strictly before expiry; only the payer may refund at
 * or after expiry. Expiry alone does not change a hold's stored status.
 */
contract Latch is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Arc's official USDC ERC-20 interface (six decimals).
    IERC20 public constant USDC = IERC20(0x3600000000000000000000000000000000000000);

    enum Status {
        Active,
        Captured,
        Refunded
    }

    /// @dev For every existing hold: deposited = captured + refunded + remaining.
    struct Hold {
        address payer;
        address recipient;
        uint256 deposited;
        uint256 captured;
        uint256 refunded;
        uint256 expiry;
        Status status;
    }

    mapping(uint256 => Hold) private _holds;

    /// @notice Number of holds created; also the latest assigned hold ID.
    uint256 public holdCount;

    error InvalidRecipient();
    error ZeroAmount();
    error InvalidExpiry(uint256 expiry);
    error UnknownHold(uint256 holdId);
    error NotRecipient();
    error NotPayer();
    error HoldNotActive(uint256 holdId);
    error HoldExpired(uint256 expiry);
    error HoldNotExpired(uint256 expiry);
    error AmountExceedsRemaining(uint256 requested, uint256 available);
    error NothingToRefund();
    error UnexpectedDepositBalance(uint256 beforeBalance, uint256 afterBalance, uint256 expectedAmount);

    event HoldCreated(
        uint256 indexed holdId,
        address indexed payer,
        address indexed recipient,
        uint256 amount,
        uint256 expiry
    );
    event Captured(uint256 indexed holdId, address indexed recipient, uint256 amount, uint256 remaining);
    event Refunded(uint256 indexed holdId, address indexed payer, uint256 amount);

    /**
     * @notice Fund a new authorization using the caller's approved USDC allowance.
     * @param recipient Only this address may capture; cannot be zero or the payer.
     * @param amount USDC base units to escrow; must be nonzero.
     * @param expiry Unix timestamp strictly later than the current block timestamp.
     * @return holdId Sequential ID, starting at 1.
     * @dev Records effects before transferFrom. An unexpected balance delta reverts
     * the entire operation, including the transfer and allocated ID.
     */
    function createHold(address recipient, uint256 amount, uint256 expiry)
        external
        nonReentrant
        returns (uint256 holdId)
    {
        if (recipient == address(0) || recipient == msg.sender) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();
        if (expiry <= block.timestamp) revert InvalidExpiry(expiry);

        uint256 beforeBalance = USDC.balanceOf(address(this));
        holdId = ++holdCount;
        _holds[holdId] = Hold({
            payer: msg.sender,
            recipient: recipient,
            deposited: amount,
            captured: 0,
            refunded: 0,
            expiry: expiry,
            status: Status.Active
        });

        USDC.safeTransferFrom(msg.sender, address(this), amount);
        uint256 afterBalance = USDC.balanceOf(address(this));
        if (afterBalance < beforeBalance || afterBalance - beforeBalance != amount) {
            revert UnexpectedDepositBalance(beforeBalance, afterBalance, amount);
        }

        emit HoldCreated(holdId, msg.sender, recipient, amount, expiry);
    }

    /**
     * @notice Capture part or all of a hold strictly before expiry.
     * @param holdId Existing hold ID.
     * @param amount Nonzero USDC base units, not exceeding the remaining amount.
     * @dev Only the designated recipient may call. Full capture is terminal.
     */
    function capture(uint256 holdId, uint256 amount) external nonReentrant {
        Hold storage hold = _getHold(holdId);
        if (msg.sender != hold.recipient) revert NotRecipient();
        if (hold.status != Status.Active) revert HoldNotActive(holdId);
        if (block.timestamp >= hold.expiry) revert HoldExpired(hold.expiry);
        if (amount == 0) revert ZeroAmount();

        uint256 available = hold.deposited - hold.captured - hold.refunded;
        if (amount > available) revert AmountExceedsRemaining(amount, available);
        uint256 newRemaining = available - amount;
        hold.captured += amount;
        if (newRemaining == 0) hold.status = Status.Captured;

        USDC.safeTransfer(hold.recipient, amount);
        emit Captured(holdId, hold.recipient, amount, newRemaining);
    }

    /**
     * @notice Return all unspent USDC to the payer at or after expiry.
     * @param holdId Existing active hold ID with a nonzero remaining amount.
     * @dev Only the payer may call. Refund is terminal, including after partial capture.
     */
    function refundExpired(uint256 holdId) external nonReentrant {
        Hold storage hold = _getHold(holdId);
        if (msg.sender != hold.payer) revert NotPayer();
        if (hold.status != Status.Active) revert HoldNotActive(holdId);
        if (block.timestamp < hold.expiry) revert HoldNotExpired(hold.expiry);

        uint256 amount = hold.deposited - hold.captured - hold.refunded;
        if (amount == 0) revert NothingToRefund();
        hold.refunded += amount;
        hold.status = Status.Refunded;

        USDC.safeTransfer(hold.payer, amount);
        emit Refunded(holdId, hold.payer, amount);
    }

    /// @notice Return all accounting and authorization fields; unknown IDs revert.
    /// @param holdId Existing hold ID (1 through holdCount()).
    /// @return hold The stored hold, including its status and refunded amount.
    function getHold(uint256 holdId) external view returns (Hold memory hold) {
        return _getHold(holdId);
    }

    /// @notice Return unspent USDC base units; unknown IDs revert.
    /// @param holdId Existing hold ID.
    /// @return amount Deposited minus captured minus refunded.
    function remaining(uint256 holdId) external view returns (uint256 amount) {
        Hold storage hold = _getHold(holdId);
        return hold.deposited - hold.captured - hold.refunded;
    }

    function _getHold(uint256 holdId) private view returns (Hold storage hold) {
        hold = _holds[holdId];
        if (hold.payer == address(0)) revert UnknownHold(holdId);
    }
}
