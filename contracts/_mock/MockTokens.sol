pragma solidity ^0.6.12;

import {MockERC20} from "./MockERC20.sol";
import "../interfaces/IReserve.sol";

contract MockUSDC is MockERC20 {
    constructor() public MockERC20("MockUSDC", "MUSDC") { }
}

contract MockLedgity is MockERC20 {
    IReserve reserve;

    constructor() public MockERC20("MockLedgity", "MLTY") { }

    function setReserve(address _reserve) external {
        reserve = IReserve(_reserve);
    }

    function swapAndCollect(uint256 tokenAmount) external {
        reserve.swapAndCollect(tokenAmount);
    }

    function swapAndLiquify(uint256 tokenAmount) external {
        reserve.swapAndLiquify(tokenAmount);
    }

    function burn(uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "MockLedgity: non enough tokens to burn");
        totalSupply -= amount;
        balanceOf[msg.sender] -= amount;
        emit Transfer(msg.sender, address(0), amount);
        return true;
    }
}
