import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { addLiquidityUtil, deployUniswap, toTokens, ZERO_ADDRESS } from '../shared/utils';
import { MockLedgity, MockUSDC, Reserve, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from '../typechain';
import UniswapV2PairArtifact from '../uniswap_build/contracts/UniswapV2Pair.json';
const { expect } = chai;

describe('Reserve', () => {
  let aliceAccount: SignerWithAddress, bobAccount: SignerWithAddress, timelockAccount: SignerWithAddress;
  let alice: string, bob: string, timelock: string;
  before(async () => {
    [aliceAccount, bobAccount, timelockAccount] = await ethers.getSigners();
    [alice, bob, timelock] = [aliceAccount, bobAccount, timelockAccount].map(account => account.address);
  });

  /**
   * Simulate token. Should call `swapAndLiquify` and `swapAndCollect` functions.
   */
  let token: MockLedgity;
  let reserve: Reserve;
  let factory: UniswapV2Factory;
  let usdcToken: MockUSDC;
  let router: UniswapV2Router02;

  before(async () => {
    ({ factory, router } = await deployUniswap(aliceAccount));
    usdcToken = await (await ethers.getContractFactory('MockUSDC')).deploy();
  });

  beforeEach(async () => {
    token = await (await ethers.getContractFactory('MockLedgity')).deploy();
    await token.mint(alice, toTokens('100000000000000'));
    reserve = await (await ethers.getContractFactory('Reserve')).deploy(router.address, token.address, usdcToken.address, timelock);
    await token.setReserve(reserve.address);
  });

  async function addLiquidity(tokenAmount: string, usdcAmount: string) {
    await addLiquidityUtil(tokenAmount, usdcAmount, token, usdcToken, router, alice);
  }

  async function getPair() {
    const pairAddress = await factory.getPair(token.address, usdcToken.address);
    return await ethers.getContractAt(UniswapV2PairArtifact.abi, pairAddress) as UniswapV2Pair;
  }

  async function getPairIndices(pair: UniswapV2Pair) {
    return await pair.token0() === token.address ? [0, 1] as const : [1, 0] as const;
  }

  describe('constructor', () => {
    it('should not allow zero address timelock', async () => {
      const tokenA = await (await ethers.getContractFactory('MockUSDC')).deploy();
      const tokenB = await (await ethers.getContractFactory('MockUSDC')).deploy();
      await expect((await ethers.getContractFactory('Reserve')).deploy(router.address, tokenA.address, tokenB.address, ZERO_ADDRESS))
        .to.be.revertedWith('Reserve: invalid timelock address');
    });
  });

  describe('swapping for USDC', () => {
    beforeEach(async () => {
      await addLiquidity('10', '1');
    });

    it('should swap tokens for USDC and store USDC in the reserve', async () => {
      const amount = toTokens('10');
      const usdcBalanceBefore = await usdcToken.balanceOf(reserve.address);
      await token.transfer(reserve.address, amount);
      await token.swapAndCollect(amount);
      expect(await token.balanceOf(reserve.address)).to.eq('0', 'reserve token balance');
      expect(await usdcToken.balanceOf(reserve.address)).to.be.gt(usdcBalanceBefore, 'reserve usdc balance');
    });

    it('should emit SwapAndCollect event', async () => {
      const amount = toTokens('10');
      await token.transfer(reserve.address, amount);
      await expect(token.swapAndCollect(amount)).to.emit(reserve, 'SwapAndCollect');
    });

    it('should not allow anyone except the token contract to swap the tokens', async () => {
      for (const sender of [aliceAccount, bobAccount]) {
        await expect(reserve.connect(sender).swapAndCollect('10')).to.be.revertedWith('Reserve: caller is not the token');
      }
    });
  });

  describe('swap and liquify', () => {
    beforeEach(async () => {
      await addLiquidity('10000', '1000');
    });

    async function testSwapAndLiquify({ reserveBalance, amount, liquified }: { reserveBalance: BigNumber; amount: BigNumber; liquified: BigNumber; }) {
      const pair = await getPair();
      const reservesBefore = await pair.getReserves();
      await token.transfer(reserve.address, reserveBalance.add(amount));
      await token.swapAndLiquify(amount);

      const reserves = await pair.getReserves();
      const [tokenIndex, usdcIndex] = await getPairIndices(pair);
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].add(liquified));
      expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex]);  // USDC reserves unchanged
    }

    it('should swap and liquify all tokens, if the reserve has enough tokens on the balance', async () => {
      await testSwapAndLiquify({
        reserveBalance: toTokens('30'),
        amount: toTokens('10'),
        liquified: toTokens('20'),
      });
    });

    it('should swap and liquify only a portion of tokens, if the reserve does NOT have enough tokens on the balance', async () => {
      await testSwapAndLiquify({
        reserveBalance: toTokens('2'),
        amount: toTokens('10'),
        liquified: toTokens('12'),
      });
    });

    it('should emit SwapAndLiquify event', async () => {
      const amount = toTokens('10');
      await token.transfer(reserve.address, amount.mul(2));
      await expect(token.swapAndLiquify(amount)).to.emit(reserve, 'SwapAndLiquify');
    });

    it('should mint LP tokens to the timelock', async () => {
      const pair = await getPair();
      const amount = toTokens('10');
      await token.transfer(reserve.address, amount.mul(2));
      const timelockBalanceBefore = await pair.balanceOf(timelock);
      await token.swapAndLiquify(amount);
      // TODO: make a better expectation.
      expect(await pair.balanceOf(timelock)).to.be.gt(timelockBalanceBefore);
    });

    it('should not allow anyone except the token contract to swap and liquify tokens', async () => {
      for (const sender of [aliceAccount, bobAccount]) {
        await expect(reserve.connect(sender).swapAndLiquify('10')).to.be.revertedWith('Reserve: caller is not the token');
      }
    });
  });

  describe('buy and burn', () => {
    beforeEach(async () => {
      await addLiquidity('10000', '1000');
    });

    it('should buy tokens and burn them', async () => {
      const pair = await getPair();
      const reservesBefore = await pair.getReserves();
      const totalSupplyBefore = await token.totalSupply();

      const usdcAmount = toTokens('10', await usdcToken.decimals());
      await usdcToken.mint(reserve.address, usdcAmount);
      await reserve.buyAndBurn(usdcAmount);

      expect(await token.totalSupply()).to.be.lt(totalSupplyBefore, 'supply');
      const reserves = await pair.getReserves();
      const [tokenIndex, usdcIndex] = await getPairIndices(pair);
      expect(reserves[tokenIndex]).to.be.lt(reservesBefore[tokenIndex], 'token');
      expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex].add(usdcAmount), 'usdc');
    });

    it('should not allow anyone except the owner of the contract to buy and burn tokens', async () => {
      await expect(reserve.connect(bobAccount).buyAndBurn('10')).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });
});
