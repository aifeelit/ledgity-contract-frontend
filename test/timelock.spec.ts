import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { ethers } from 'hardhat';
import { evmIncreaseTime, getBlockTimestamp } from '../shared/utils';
import { MockUSDC, Timelock } from '../typechain';
const { expect } = chai;

describe('Timelock', () => {
  let aliceAccount: SignerWithAddress, bobAccount: SignerWithAddress;
  let alice: string;
  before(async () => {
    [aliceAccount, bobAccount] = await ethers.getSigners();
    [alice] = [aliceAccount].map(account => account.address);
  });

  const DELAY = 60 * 60;  // 1 hour
  let timelock: Timelock;
  let deployedAt: number;
  let token: MockUSDC;

  beforeEach(async () => {
    token = await (await ethers.getContractFactory('MockUSDC')).deploy();
    timelock = (await (await ethers.getContractFactory('Timelock')).deploy(DELAY));
    deployedAt = await getBlockTimestamp();
    await token.mint(timelock.address, 1000);
  });

  describe('constructor', () => {
    it('should be constructed with delay parameter', async () => {
      expect(await timelock.unlockAt()).to.eq(deployedAt + DELAY);
    });
  });

  describe('withdraw', () => {
    it('should withdraw after unlocked', async () => {
      await evmIncreaseTime(DELAY + 1);
      await timelock.withdraw(token.address, 10);
    });

    it('should withdraw correct amount', async () => {
      await evmIncreaseTime(DELAY + 10);
      await timelock.withdraw(token.address, 10);
      expect(await token.balanceOf(alice)).to.eq(10);
    });

    it('should NOT withdraw until unlocked', async () => {
      await evmIncreaseTime(DELAY - 10);
      await expect(timelock.withdraw(token.address, 10)).to.be.revertedWith('Timelock: locked');
    });

    it('should NOT withdraw to not the owner', async () => {
      await evmIncreaseTime(DELAY + 10);
      await expect(timelock.connect(bobAccount).withdraw(token.address, '10')).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setDelay', () => {
    it('should set delay after unlocked', async () => {
      await evmIncreaseTime(DELAY + 10);
      const newDelay = 120 * 60;  // 2 minutes
      await timelock.setDelay(newDelay);
      expect(await timelock.unlockAt()).to.eq(await getBlockTimestamp() + newDelay);
    });

    it('should NOT allow to set delay until unlocked', async () => {
      await evmIncreaseTime(DELAY - 10);
      await expect(timelock.setDelay(1)).to.be.revertedWith('Timelock: locked');
    });

    it('should NOT allow not the owner to set delay', async () => {
      await evmIncreaseTime(DELAY + 10);
      await expect(timelock.connect(bobAccount).setDelay(1)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
