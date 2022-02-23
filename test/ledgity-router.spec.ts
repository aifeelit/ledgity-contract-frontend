import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber, BigNumberish } from 'ethers';
import { ethers } from 'hardhat';
import { deployUniswap, getBlockTimestamp, NON_ZERO_ADDRESS, toTokens, ZERO_ADDRESS } from '../shared/utils';
import { IERC20, Ledgity, LedgityRouter, MockUSDC, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from '../typechain';
import UniswapV2PairArtifact from '../uniswap_build/contracts/UniswapV2Pair.json';


describe('LedgityRouter', () => {
  let aliceAccount: SignerWithAddress, bobAccount: SignerWithAddress, charlieAccount: SignerWithAddress;
  let alice: string, bob: string, charlie: string;
  before(async () => {
    [aliceAccount, bobAccount, charlieAccount] = await ethers.getSigners();
    [alice, bob, charlie] = [aliceAccount, bobAccount, charlieAccount].map(account => account.address);
  });

  let token: Ledgity;
  let usdcToken: MockUSDC;
  let pair: UniswapV2Pair;
  let tokenIndex: 0 | 1, usdcIndex: 0 | 1;
  let factory: UniswapV2Factory;
  let uniswapRouter: UniswapV2Router02;
  let ledgityRouter: LedgityRouter;
  before(async () => {
    ({ factory, router: uniswapRouter } = await deployUniswap(aliceAccount));
  });

  beforeEach(async () => {
    usdcToken = await (await ethers.getContractFactory('MockUSDC')).deploy();
    await usdcToken.mint(alice, toTokens('100000000000'));

    token = await (await ethers.getContractFactory('Ledgity')).deploy();
    const tokenReserve = await (await ethers.getContractFactory('Reserve')).deploy(uniswapRouter.address, token.address, usdcToken.address, NON_ZERO_ADDRESS);
    token.initializeReserve(tokenReserve.address);
    ledgityRouter = await (await ethers.getContractFactory('LedgityRouter')).deploy(uniswapRouter.address);
    await token.setIsExcludedFromDexFee(ledgityRouter.address, true);
    await token.setIsExcludedFromLimits(ledgityRouter.address, true);

    pair = await ethers.getContractAt(UniswapV2PairArtifact.abi, await factory.getPair(token.address, usdcToken.address)) as UniswapV2Pair;
    [tokenIndex, usdcIndex] = await pair.token0() === token.address ? [0, 1] : [1, 0];
  });

  async function addInitialLiquidity(tokenAmount: BigNumberish, usdcAmount: BigNumberish) {
    const wasExcluded = await token.isExcludedFromDexFee(alice);
    await token.setIsExcludedFromDexFee(alice, true);
    await token.approve(uniswapRouter.address, tokenAmount);
    await usdcToken.approve(uniswapRouter.address, usdcAmount);
    await uniswapRouter.addLiquidity(
      token.address, usdcToken.address,
      tokenAmount, usdcAmount, tokenAmount, usdcAmount,
      ZERO_ADDRESS, await getBlockTimestamp() + 3600,
    );
    await token.setIsExcludedFromDexFee(alice, wasExcluded);
  }

  async function addLiquidityLedgityRouter(tokenA: IERC20, tokenB: IERC20, amountA: BigNumberish, amountB: BigNumberish, from: SignerWithAddress, to: string) {
    await tokenA.connect(from).approve(ledgityRouter.address, amountA);
    await tokenB.connect(from).approve(ledgityRouter.address, amountB);
    await ledgityRouter.connect(from).addLiquidityBypassingFee(
      tokenA.address, tokenB.address,
      amountA, amountB, 0, 0,
      to, await getBlockTimestamp() + 3600,
    );
  }

  async function removeLiquidityLedgityRouter(liquidity: BigNumberish, from: SignerWithAddress, to: string) {
    await pair.connect(from).approve(ledgityRouter.address, liquidity);
    await ledgityRouter.connect(from).removeLiquidityBypassingFee(
      token.address, usdcToken.address,
      liquidity, 0, 0,
      to, await getBlockTimestamp() + 3600,
    );
  }

  let reservesBefore: { 0: BigNumber, 1: BigNumber; };
  beforeEach(async () => {
    await token.excludeAccount(alice);
    await token.setIsExcludedFromDexFee(alice, false);  // exclude from dex fee to charge fees
    reservesBefore = await pair.getReserves();
  });

  describe('addLiquidityBypassingFee', () => {
    it('should NOT charge sell fee when adding liquidity', async () => {
      const tokenBalanceBefore = await token.balanceOf(alice);
      const usdcBalanceBefore = await usdcToken.balanceOf(alice);
      const tokenAmount = toTokens('100');
      const usdcAmount = toTokens('10');
      await addLiquidityLedgityRouter(token, usdcToken, tokenAmount, usdcAmount, aliceAccount, bob);
      const reserves = await pair.getReserves();
      expect(await token.balanceOf(alice)).to.eq(tokenBalanceBefore.sub(tokenAmount));
      expect(await usdcToken.balanceOf(alice)).to.eq(usdcBalanceBefore.sub(usdcAmount));
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].add(tokenAmount));
      expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex].add(usdcAmount));
    });

    it('should mint LP tokens', async () => {
      const lpBalanceBefore = await pair.balanceOf(bob);
      await addLiquidityLedgityRouter(token, usdcToken, toTokens('1000'), toTokens('10'), aliceAccount, bob);
      expect(await pair.balanceOf(bob)).to.be.gt(lpBalanceBefore);
    });

    it('should refund any remaining tokens', async () => {
      await addInitialLiquidity(toTokens('1000'), toTokens('100'));
      const tokenBalanceBefore = await token.balanceOf(alice);
      const usdcBalanceBefore = await usdcToken.balanceOf(alice);
      await addLiquidityLedgityRouter(token, usdcToken, toTokens('1500'), toTokens('100'), aliceAccount, bob);
      expect(await token.balanceOf(alice)).to.eq(tokenBalanceBefore.sub(toTokens('1000')));  // refunded
      expect(await usdcToken.balanceOf(alice)).to.eq(usdcBalanceBefore.sub(toTokens('100')));
    });
  });

  describe('removeLiquidityBypassingFee', () => {
    it('should NOT charge buy fee when removing liquidity', async () => {
      await token.setIsExcludedFromDexFee(alice, false);
      const tokenBalanceBefore = await token.balanceOf(alice);
      const usdcBalanceBefore = await usdcToken.balanceOf(alice);
      const tokenAmount = toTokens('100');
      const usdcAmount = toTokens('10');
      // TODO: make a symmetric test where tokenA = usdcToken, tokenB = token
      await addLiquidityLedgityRouter(token, usdcToken, tokenAmount, usdcAmount, aliceAccount, alice);
      await removeLiquidityLedgityRouter(await pair.balanceOf(alice), aliceAccount, alice);
      const reserves = await pair.getReserves();
      // IDK why, but uniswap does not return all provided tokens when burning LP tokens.
      // I tested it with the UniswapRouter02 and it worked exactly the same.
      const [tokenRemaining, usdcRemaining] = [3163, 317];
      expect(await token.balanceOf(alice)).to.eq(tokenBalanceBefore.sub(tokenRemaining));
      expect(await usdcToken.balanceOf(alice)).to.eq(usdcBalanceBefore.sub(usdcRemaining));
      expect(reserves[tokenIndex]).to.be.eq(reservesBefore[tokenIndex].add(tokenRemaining));
      expect(reserves[usdcIndex]).to.be.eq(reservesBefore[usdcIndex].add(usdcRemaining));
    });

    it('should withdraw liquidity to the specified address', async () => {
      await token.setIsExcludedFromDexFee(alice, false);
      const tokenAmount = toTokens('100');
      const usdcAmount = toTokens('10');
      await addLiquidityLedgityRouter(token, usdcToken, tokenAmount, usdcAmount, aliceAccount, alice);
      await removeLiquidityLedgityRouter(await pair.balanceOf(alice), aliceAccount, bob);  // withdraw to Bob's account
      expect(await token.balanceOf(bob)).to.eq(tokenAmount.sub(3163));
      expect(await usdcToken.balanceOf(bob)).to.eq(usdcAmount.sub(317));
    });
  });
});
