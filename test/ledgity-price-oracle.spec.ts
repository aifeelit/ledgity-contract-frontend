import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import { deployUniswap, evmIncreaseTime, getBlockTimestamp, toTokens, ZERO_ADDRESS } from '../shared/utils';
import { LedgityPriceOracle, MockERC20, MockUSDC, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from '../typechain';
import UniswapV2PairArtifact from '../uniswap_build/contracts/UniswapV2Pair.json';


const PERIOD = 12 * 60 * 60;  // 12 hours
const INITIAL_LIQUIDITY = [toTokens('100000000'), toTokens('1000000000')] as const;  // 1 : 10 price

describe('LedgityPriceOracle', () => {
  let aliceAccount: SignerWithAddress, bobAccount: SignerWithAddress;
  let alice: string, bob: string;
  before(async () => {
    [aliceAccount, bobAccount] = await ethers.getSigners();
    [alice, bob] = [aliceAccount].map(account => account.address);
  });

  let oracle: LedgityPriceOracle;
  let token0: MockUSDC;
  let token1: MockUSDC;
  let factory: UniswapV2Factory;
  let router: UniswapV2Router02;
  let pair: UniswapV2Pair;
  before(async () => {
    ({ factory, router } = await deployUniswap(aliceAccount));
  });
  beforeEach(async () => {
    const tokenA = await (await ethers.getContractFactory('MockUSDC')).deploy();
    const tokenB = await (await ethers.getContractFactory('MockUSDC')).deploy();
    [token0, token1] = tokenA.address < tokenB.address ? [tokenA, tokenB] : [tokenB, tokenA];
    await factory.createPair(token0.address, token1.address);
    pair = await ethers.getContractAt(UniswapV2PairArtifact.abi, await factory.getPair(token0.address, token1.address)) as UniswapV2Pair;
    await addLiquidity(INITIAL_LIQUIDITY[0], INITIAL_LIQUIDITY[1]);
    oracle = await (await ethers.getContractFactory('LedgityPriceOracle')).deploy(pair.address);
  });

  async function addLiquidity(amount0: BigNumberish, amount1: BigNumberish, from = aliceAccount) {
    await token0.mint(from.address, amount0);
    await token0.connect(from).approve(router.address, amount0);
    await token1.mint(from.address, amount1);
    await token1.connect(from).approve(router.address, amount1);
    await router.connect(from).addLiquidity(
      token0.address, token1.address,
      amount0, amount1, 0, 0,
      ZERO_ADDRESS, await getBlockTimestamp() + 3600,
    );
  }

  async function swap(amount: BigNumberish, tokenIn: MockERC20, tokenOut: MockERC20, from: SignerWithAddress) {
    await tokenIn.mint(from.address, amount);
    await tokenIn.connect(from).approve(router.address, amount);
    await router.connect(from).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      amount,
      0,
      [tokenIn.address, tokenOut.address],
      from.address,
      await getBlockTimestamp() + 3600,
    );
  }

  describe('constructor', () => {
    it('should be created with 12h period', async () => {
      expect(await oracle.period()).to.eq(PERIOD);
    });

    it('should set initial price', async () => {
      expect(await oracle.consult(token0.address, toTokens(1))).to.eq(toTokens(10));
    });

    it('should NOT be created when there is no liquidity', async () => {
      const tokenA = await (await ethers.getContractFactory('MockUSDC')).deploy();
      const tokenB = await (await ethers.getContractFactory('MockUSDC')).deploy();
      await factory.createPair(tokenA.address, tokenB.address);
      const pairAddress = await factory.getPair(tokenA.address, tokenB.address);
      await expect((await ethers.getContractFactory('LedgityPriceOracle')).deploy(pairAddress))
        .to.be.revertedWith('LedgityPriceOracle: NO_RESERVES');
    });
  });

  describe('update and consult', () => {
    async function testPriceDecreases(tokenA: MockERC20, tokenB: MockERC20) {
      const priceABefore = await oracle.consult(tokenA.address, toTokens(1));
      const priceBBefore = await oracle.consult(tokenB.address, toTokens(1));
      await swap(toTokens(10), tokenA, tokenB, aliceAccount);
      await evmIncreaseTime(PERIOD);
      await oracle.update();
      expect(await oracle.consult(tokenA.address, toTokens(1))).to.be.lt(priceABefore);
      expect(await oracle.consult(tokenB.address, toTokens(1))).to.be.gt(priceBBefore);
    }

    it('should decrease price relative to token0', async () => {
      await testPriceDecreases(token0, token1);
    });

    it('should decrease price relative to token1', async () => {
      await testPriceDecreases(token1, token0);
    });

    async function testPriceIncreases(tokenA: MockERC20, tokenB: MockERC20) {
      const priceABefore = await oracle.consult(tokenA.address, toTokens(1));
      const priceBBefore = await oracle.consult(tokenB.address, toTokens(1));
      await swap(toTokens(10), tokenB, tokenA, aliceAccount);
      await evmIncreaseTime(PERIOD);
      await oracle.update();
      expect(await oracle.consult(tokenA.address, toTokens(1))).to.be.gt(priceABefore);
      expect(await oracle.consult(tokenB.address, toTokens(1))).to.be.lt(priceBBefore);
    }

    it('should increase price relative to token0', async () => {
      await testPriceIncreases(token0, token1);
    });

    it('should increase price relative to token1', async () => {
      await testPriceIncreases(token1, token0);
    });

    it('should NOT update more than once per period', async () => {
      await evmIncreaseTime(PERIOD);
      await oracle.update();
      await evmIncreaseTime(PERIOD - 10);
      await expect(oracle.update()).to.be.revertedWith('LedgityPriceOracle: PERIOD_NOT_ELAPSED');
    });

    it('should update after period elapsed', async () => {
      await evmIncreaseTime(PERIOD);
      await oracle.update();
      await evmIncreaseTime(PERIOD);
      await oracle.update();  // OK
    });
  });

  describe('changePeriod', () => {
    it('should change period', async () => {
      await oracle.changePeriod(120);
      expect(await oracle.period()).to.eq(120);
    });

    it('should NOT allow not the owner to call it', async () => {
      await expect(oracle.connect(bobAccount).changePeriod(1)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should not allow 0 period', async () => {
      await expect(oracle.changePeriod(0)).to.be.revertedWith('LedgityPriceOracle: INVALID_PERIOD');
    });
  });
});
