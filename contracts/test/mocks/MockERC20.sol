// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev Minimal 6-decimal mintable ERC-20 used ONLY in tests. Designed to be `vm.etch`ed to a
/// hardcoded token address: name/symbol/decimals are constants (storage is NOT copied by etch).
/// Test knobs (stored in the etched address' storage): fee-on-transfer and a re-entrancy hook.
contract MockERC20 {
    uint8 public constant decimals = 6;
    string public constant name = "Mock USDC";
    string public constant symbol = "mUSDC";

    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    // Test knobs
    uint256 public feeBps; // burned from the amount delivered on transferFrom
    address public hookTarget;
    bytes public hookData;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    function mint(address to, uint256 amount) external {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function setFeeBps(uint256 bps) external {
        feeBps = bps;
    }

    function setHook(address target, bytes calldata data) external {
        hookTarget = target;
        hookData = data;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _runHook();
        _move(msg.sender, to, amount, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        _runHook();
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "MockERC20: allowance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        uint256 delivered = amount - (amount * feeBps) / 10_000;
        _move(from, to, amount, delivered);
        return true;
    }

    function _move(address from, address to, uint256 debit, uint256 credit) internal {
        require(balanceOf[from] >= debit, "MockERC20: balance");
        balanceOf[from] -= debit;
        balanceOf[to] += credit;
        totalSupply -= (debit - credit);
        emit Transfer(from, to, credit);
    }

    function _runHook() internal {
        address target = hookTarget;
        if (target == address(0)) return;
        (bool ok, bytes memory ret) = target.call(hookData);
        if (!ok) {
            assembly {
                revert(add(ret, 0x20), mload(ret))
            }
        }
    }
}
