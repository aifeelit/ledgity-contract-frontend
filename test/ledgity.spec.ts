import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import chai from 'chai';
import { BigNumber, BigNumberish } from "ethers";
import { ethers } from 'hardhat';
import { addLiquidityUtil, deployUniswap, evmIncreaseTime, getBlockTimestamp, LEDGITY_DECIMALS, NON_ZERO_ADDRESS, toTokens, ZERO_ADDRESS } from '../shared/utils';
import { Ledgity, LedgityPriceOracle, MockUSDC, Reserve, UniswapV2Factory, UniswapV2Pair, UniswapV2Router02 } from '../typechain';
import UniswapV2PairArtifact from '../uniswap_build/contracts/UniswapV2Pair.json';
const { expect } = chai;

const INITIAL_TOTAL_SUPPLY = toTokens('2760000000', 18);
const NUM_TOKENS_TO_LIQUIFY_OR_COLLECT = INITIAL_TOTAL_SUPPLY.mul(15).div(10000);

describe('Ledgity', () => {
  let aliceAccount: SignerWithAddress, bobAccount: SignerWithAddress, charlieAccount: SignerWithAddress;
  let alice: string, bob: string, charlie: string;
  before(async () => {
    [aliceAccount, bobAccount, charlieAccount] = await ethers.getSigners();
    [alice, bob, charlie] = [aliceAccount, bobAccount, charlieAccount].map(account => account.address);
  });

  let token: Ledgity;
  let tokenReserve: Reserve;
  let priceOracle: LedgityPriceOracle;
  let factory: UniswapV2Factory;
  let usdcToken: MockUSDC;
  let router: UniswapV2Router02;
  before(async () => {
    ({ factory, router } = await deployUniswap(aliceAccount));
    usdcToken = await (await ethers.getContractFactory('MockUSDC')).deploy();
  });

  beforeEach(async () => {
    token = await (await ethers.getContractFactory('Ledgity')).deploy();
    tokenReserve = await (await ethers.getContractFactory('Reserve')).deploy(router.address, token.address, usdcToken.address, NON_ZERO_ADDRESS);
    await token.initializeReserve(tokenReserve.address);
    await addLiquidityUtil('1000', '100', token, usdcToken, router, alice);
    priceOracle = await (await ethers.getContractFactory('LedgityPriceOracle')).deploy(await token.uniswapV2Pair());
    await token.initializePriceOracle(priceOracle.address);
  });

  async function getPair() {
    const pairAddress = await factory.getPair(token.address, usdcToken.address);
    return await ethers.getContractAt(UniswapV2PairArtifact.abi, pairAddress) as UniswapV2Pair;
  }

  async function getPairIndices(pair: UniswapV2Pair) {
    return await pair.token0() === token.address ? [0, 1] as const : [1, 0] as const;
  }

  async function sell(tokenAmount: BigNumberish, from: SignerWithAddress) {
    await token.connect(from).approve(router.address, tokenAmount);
    await router.connect(from).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      tokenAmount,
      0, // accept any amount of USDC
      [token.address, usdcToken.address],
      from.address,
      await getBlockTimestamp() + 3600,
    );
  }

  async function buy(usdcAmount: BigNumberish, from: SignerWithAddress) {
    const pair = await getPair();
    const [tokenIndex] = await getPairIndices(pair);
    const reservesBefore = await pair.getReserves();
    await usdcToken.mint(from.address, usdcAmount);
    await usdcToken.connect(from).approve(router.address, usdcAmount);
    await router.connect(from).swapExactTokensForTokensSupportingFeeOnTransferTokens(
      usdcAmount,
      0, // accept any amount of tokens
      [usdcToken.address, token.address],
      from.address,
      await getBlockTimestamp() + 3600,
    );
    // How many tokens bought(without the fee)?
    return reservesBefore[tokenIndex].sub((await pair.getReserves())[tokenIndex]);
  }

  describe('constructor', () => {
    it('should have correct token info', async () => {
      expect(await token.name()).to.eq('Ledgity', 'name');
      expect(await token.symbol()).to.eq('LTY', 'symbol');
      expect(await token.totalSupply()).to.eq(INITIAL_TOTAL_SUPPLY, 'initial total supply');
      expect(await token.decimals()).to.eq(LEDGITY_DECIMALS, 'decimals');
    });

    it('should send all supply to the owner', async () => {
      token = await (await ethers.getContractFactory('Ledgity')).deploy();
      const balance = await token.balanceOf(alice);
      expect(balance).to.eq(INITIAL_TOTAL_SUPPLY, 'Initial supply not sent to the owner');
    });
  });

  describe('initialize', () => {
    it('should not allow not the owner to call it', async () => {
      await expect(token.connect(bobAccount).initializeReserve(ZERO_ADDRESS))
        .to.be.revertedWith('Ownable: caller is not the owner');
      await expect(token.connect(bobAccount).initializePriceOracle(ZERO_ADDRESS))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should set initial price', async () => {
      expect(await token.initialPrice()).to.be.closeTo(toTokens(1).div(10), 1);
    });

    it('should NOT update initial price on another initialize', async () => {
      await buy(toTokens('500'), aliceAccount);
      await evmIncreaseTime((await priceOracle.period()).toNumber());
      await priceOracle.update();
      await token.initializePriceOracle(priceOracle.address);
      expect(await token.initialPrice()).to.be.closeTo(toTokens(1).div(10), 1);
    });
  });

  describe('transfer', () => {
    it('should transfer tokens', async () => {
      const aliceBalanceBefore = await token.balanceOf(alice);
      const bobBalanceBefore = await token.balanceOf(bob);
      const amount = toTokens('10');
      await token.transfer(bob, amount);
      expect(await token.balanceOf(alice)).to.eq(aliceBalanceBefore.sub(amount), 'Alice');
      expect(await token.balanceOf(bob)).to.eq(bobBalanceBefore.add(amount), 'Bob');
    });

    it('should NOT transfer more tokens than an account has on its balance', async () => {
      await token.transfer(bob, 10);
      await expect(token.connect(bobAccount).transfer(charlie, 11))
        .to.be.revertedWith('SafeMath: subtraction overflow');
    });

    it('should emit Transfer event', async () => {
      const amount = toTokens('10');
      await expect(await token.transfer(bob, amount))
        .to.emit(token, 'Transfer')
        .withArgs(alice, bob, amount);
    });
  });

  describe('transfer: time limit', () => {
    it('should NOT allow two transfers from one account within 15 minutes', async () => {
      await token.transfer(bob, 10);  // to allow transfers from Bob's account
      await token.connect(bobAccount).transfer(alice, 1);
      await evmIncreaseTime(15 * 60 - 10);  // wait for <15 minutes
      await expect(token.connect(bobAccount).transfer(charlie, 1))
        .to.be.revertedWith('Ledgity: only one transaction per 15 minutes');
    });

    it('should allow two transfers from one account with interval greater than 15 minutes', async () => {
      await token.transfer(bob, 1);
      await evmIncreaseTime(15 * 60 + 1);  // wait for >15 minutes
      await token.transfer(charlie, 1);
    });

    it('should allow two transfers from different accounts within 15 minutes', async () => {
      await token.transfer(bob, 1);
      await token.connect(bobAccount).transfer(charlie, 1);
      await token.connect(charlieAccount).transfer(alice, 1);
    });

    it('should not limit the owner', async () => {
      await token.transfer(bob, 1);
      await token.transfer(charlie, 1);
    });

    it('should not limit uniswap', async () => {
      await usdcToken.mint(alice, toTokens('100000', await usdcToken.decimals()));
      async function doSwap() {
        const usdcAmount = toTokens(100, await usdcToken.decimals());
        await usdcToken.approve(router.address, usdcAmount);
        await router.swapExactTokensForTokensSupportingFeeOnTransferTokens(usdcAmount, toTokens(10), [usdcToken.address, token.address], alice, await getBlockTimestamp() + 3600);
      }
      await doSwap();
      await doSwap();
      await doSwap();
    });
  });

  describe('transfer: max size', () => {
    it('should allow owner to transfer any amount of tokens', async () => {
      await token.transfer(bob, await token.balanceOf(alice));
    });

    it('should not allow transfers over 0.05% of the total supply if the sender is not the owner', async () => {
      const totalSupply = await token.totalSupply();
      await token.transfer(bob, await token.balanceOf(alice));
      await expect(token.connect(bobAccount).transfer(alice, totalSupply.mul(5).div(10000).add(1)))
        .to.be.revertedWith('Ledgity: max transaction size exceeded');
    });

    it('should allow transfers less than 0.05% of the liquidity pool reserves', async () => {
      const totalSupply = await token.totalSupply();
      await token.transfer(bob, await token.balanceOf(alice));
      await token.connect(bobAccount).transfer(alice, totalSupply.mul(5).div(10000));
    });

    it('should allow the owner to change max transaction size', async () => {
      await token.setMaxTransactionSizePercent(20, 100);
      expect((await token.maxTransactionSizePercent()).numerator).to.eq(20);
      expect((await token.maxTransactionSizePercent()).denominator).to.eq(100);
      const totalSupply = await token.totalSupply();
      await expect(token.connect(bobAccount).transfer(alice, totalSupply.mul(20).div(100).add(1)))
        .to.be.revertedWith('Ledgity: max transaction size exceeded');

      await token.transfer(bob, await token.balanceOf(alice));
      await token.connect(bobAccount).transfer(alice, totalSupply.mul(20).div(100));  // should not revert
    });

    it('should NOT allow not the owner to change max transaction size', async () => {
      await expect(token.connect(bobAccount).setMaxTransactionSizePercent(20, 100))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should NOT allow invalid percentages', async () => {
      await expect(token.setMaxTransactionSizePercent(101, 100))
        .to.be.revertedWith('Percent: invalid percentage');
    });
  });

  describe('transfer: fees', () => {
    let pair: UniswapV2Pair;
    let reservesBefore: { 0: BigNumber, 1: BigNumber; };
    let tokenIndex: 0 | 1, usdcIndex: 0 | 1;
    beforeEach(async () => {
      pair = await getPair();
      [tokenIndex, usdcIndex] = await getPairIndices(pair);
      await token.setIsExcludedFromDexFee(alice, false);  // exclude from dex fee to charge fees
      reservesBefore = await pair.getReserves();
    });

    it('should NOT charge fees when transferring tokens between users', async () => {
      const amount = toTokens('10');
      await token.transfer(bob, amount);
      expect(await token.balanceOf(bob)).to.eq(amount);

      const amount2 = toTokens('5');
      await token.connect(bobAccount).transfer(charlie, amount2);
      expect(await token.balanceOf(charlie)).to.eq(amount2);
    });

    it('should update oracle prices to calculate fees', async () => {
      await buy(toTokens(10), aliceAccount);
      // Price update is reflected only in the next transfer.
      const priceBefore = await priceOracle.consult(token.address, toTokens(1));
      await evmIncreaseTime((await priceOracle.period()).toNumber());
      await buy(toTokens(10), aliceAccount);
      await buy(toTokens(10), aliceAccount);  // transfer tokens twice to test that updating the price oracle does not revert
      expect(await priceOracle.consult(token.address, toTokens(1))).to.be.gt(priceBefore);
    });

    async function testSellFee(numerator: BigNumberish, denominator: BigNumberish) {
      const contractBalanceBefore = await token.balanceOf(token.address);
      const reservesBefore = await pair.getReserves();
      const amount = toTokens('10');
      await sell(amount, aliceAccount);
      const reserves = await pair.getReserves();
      const feeInTokens = amount.mul(numerator).div(denominator);
      const distributionFeeInTokens = amount.mul(4).div(100);
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].add(amount).sub(feeInTokens).sub(distributionFeeInTokens), 'token reserve');
      expect(reserves[usdcIndex]).to.be.lt(reservesBefore[usdcIndex], 'USDC reserve');
      expect(await token.balanceOf(token.address)).to.be.gte(contractBalanceBefore.add(feeInTokens), 'token balance');
    }

    describe('IDO price > x10', () => {
      beforeEach(async () => {
        // Raise price by x10
        const priceBefore = await priceOracle.consult(token.address, toTokens(1));
        await buy(toTokens('217'), aliceAccount);
        await evmIncreaseTime((await priceOracle.period()).toNumber());
        await priceOracle.update();
        expect(await priceOracle.consult(token.address, toTokens(1))).to.be.gte(priceBefore.mul(10));  // sanity check
      });

      it('should charge 6% fee when selling', async () => {
        await testSellFee(6, 100);
      });

      it('should charge changed fee when selling', async () => {
        await token.setSellAccumulationFee(3, 100);
        await testSellFee(3, 100);
      });

      it('should NOT charge fee when selling if it is set to 0%', async () => {
        await token.setSellAccumulationFee(0, 100);
        await testSellFee(0, 100);
      });
    });

    describe('IDO price < x10', () => {
      beforeEach(async () => {
        // Raise price by x9
        const priceBefore = await priceOracle.consult(token.address, toTokens(1));
        await buy(toTokens('216'), aliceAccount);
        await evmIncreaseTime((await priceOracle.period()).toNumber());
        await priceOracle.update();
        expect(await priceOracle.consult(token.address, toTokens(1))).to.be.lt(priceBefore.mul(10));  // sanity check
      });

      it('should charge 6% + 15% fee when selling if token price is less than x10 IDO price', async () => {
        await testSellFee(6 + 15, 100);
      });

      it('should charge changed fee when selling if token price is less than x10 IDO price', async () => {
        await token.setSellAtSmallPriceAccumulationFee(14, 100);
        await testSellFee(14, 100);
      });

      it('should charge fee when selling if token price is less than x10 IDO price and fee is set to 0%', async () => {
        await token.setSellAtSmallPriceAccumulationFee(0, 100);
        await testSellFee(0, 100);
      });
    });

    it('should distribute 4% of transferred tokens among holders when selling', async () => {
      await token.excludeAccount(alice);  // to make an accurate expectation

      // Bob - 7/10, Charlie - 3/10
      await token.transfer(bob, toTokens(7));
      await token.transfer(charlie, toTokens(3));
      const bobBalanceBefore = await token.balanceOf(bob);
      const charlieBalanceBefore = await token.balanceOf(charlie);

      const amount = toTokens('10000');
      await sell(amount, aliceAccount);

      const tokensDistributed = amount.mul(4).div(100);
      expect(await token.balanceOf(bob)).to.closeTo(bobBalanceBefore.add(tokensDistributed.mul(7).div(10)), 1);
      expect(await token.balanceOf(charlie)).to.closeTo(charlieBalanceBefore.add(tokensDistributed.mul(3).div(10)), 1);
    });

    async function testBuyFee(numerator: BigNumberish, denominator: BigNumberish) {
      const contractBalanceBefore = await token.balanceOf(token.address);
      const aliceBalanceBefore = await token.balanceOf(alice);
      const usdcAmount = toTokens('10', await usdcToken.decimals());
      const boughtAmount = await buy(usdcAmount, aliceAccount);
      const reserves = await pair.getReserves();
      const feeInTokens = boughtAmount.mul(numerator).div(denominator);
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].sub(boughtAmount), 'token reserve');
      expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex].add(usdcAmount), 'USDC reserve');
      expect(await token.balanceOf(alice)).to.eq(aliceBalanceBefore.add(boughtAmount).sub(feeInTokens), 'Alice balance');
      expect(await token.balanceOf(token.address)).to.eq(contractBalanceBefore.add(feeInTokens), 'token balance');
    }

    it('should charge 4% fee when buying', async () => {
      await testBuyFee(4, 100);
    });

    it('should charge changed fee when buying', async () => {
      await token.setBuyAccumulationFee(2, 100);
      await testBuyFee(2, 100);
    });

    it('should NOT charge fee when buying if it is set to 0%', async () => {
      await token.setBuyAccumulationFee(0, 100);
      await testBuyFee(0, 100);
    });

    describe('change fees', () => {
      it('should change sell fee', async () => {
        await token.setSellAccumulationFee(3, 77);
        expect((await token.sellAccumulationFee()).numerator).to.eq(3);
        expect((await token.sellAccumulationFee()).denominator).to.eq(77);
      });

      it('should change sell when price is < x10 IDO price fee', async () => {
        await token.setSellAtSmallPriceAccumulationFee(1, 18);
        expect((await token.sellAtSmallPriceAccumulationFee()).numerator).to.eq(1);
        expect((await token.sellAtSmallPriceAccumulationFee()).denominator).to.eq(18);
      });

      it('should change sell reflection fee', async () => {
        await token.setSellReflectionFee(1, 30);
        expect((await token.sellReflectionFee()).numerator).to.eq(1);
        expect((await token.sellReflectionFee()).denominator).to.eq(30);
      });

      it('should change buy fee', async () => {
        await token.setBuyAccumulationFee(1, 51);
        expect((await token.buyAccumulationFee()).numerator).to.eq(1);
        expect((await token.buyAccumulationFee()).denominator).to.eq(51);
      });

      it('should NOT allow to set fees higher than initial', async () => {
        await expect(token.setSellAccumulationFee(7, 100)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setSellAccumulationFee(4, 51)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setSellAtSmallPriceAccumulationFee(22, 100)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setSellAtSmallPriceAccumulationFee(11, 51)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setSellReflectionFee(5, 100)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setSellReflectionFee(3, 51)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setBuyAccumulationFee(5, 100)).to.be.revertedWith('Ledgity: fee too high');
        await expect(token.setBuyAccumulationFee(3, 51)).to.be.revertedWith('Ledgity: fee too high');
      });

      it('should NOT allow not allow not the owner to change fees', async () => {
        await expect(token.connect(bobAccount).setSellAccumulationFee(1, 100)).to.be.revertedWith('Ownable: caller is not the owner');
        await expect(token.connect(bobAccount).setSellAtSmallPriceAccumulationFee(1, 100)).to.be.revertedWith('Ownable: caller is not the owner');
        await expect(token.connect(bobAccount).setSellReflectionFee(1, 100)).to.be.revertedWith('Ownable: caller is not the owner');
        await expect(token.connect(bobAccount).setBuyAccumulationFee(1, 100)).to.be.revertedWith('Ownable: caller is not the owner');
      });

      it('should NOT allow incorrect percentages', async () => {
        await expect(token.setSellAccumulationFee(101, 100)).to.be.revertedWith('Percent: invalid percentage');
        await expect(token.setSellAtSmallPriceAccumulationFee(101, 100)).to.be.revertedWith('Percent: invalid percentage');
        await expect(token.setSellReflectionFee(101, 100)).to.be.revertedWith('Percent: invalid percentage');
        await expect(token.setBuyAccumulationFee(101, 100)).to.be.revertedWith('Percent: invalid percentage');
      });

      it.skip('should NOT allow sell + reflection fees to be more than 100%', async () => {
        await token.setSellReflectionFee(0, 100);  // reset
        await token.setSellAccumulationFee(99, 100);
        await token.setSellReflectionFee(1, 100);  // OK
        await expect(token.setSellReflectionFee(2, 100)).to.be.revertedWith('Ledgity: accumulation + reflection fees exceed 100%');
      });

      it.skip('should NOT allow sell small price + reflection fee to be more than 100%', async () => {
        await token.setSellReflectionFee(0, 100);  // reset
        await token.setSellAtSmallPriceAccumulationFee(99, 100);
        await token.setSellReflectionFee(1, 100);  // OK
        await expect(token.setSellReflectionFee(2, 100)).to.be.revertedWith('Ledgity: accumulation + reflection fees exceed 100%');
      });

      // Symmetric test to the tests above. Just to make sure checks are made in all setters
      it.skip('should NOT allow reflection + sell fee to be more than 100%', async () => {
        await token.setSellAccumulationFee(0, 100);  // reset
        await token.setSellAtSmallPriceAccumulationFee(0, 100);  // reset
        await token.setSellReflectionFee(99, 100);
        await expect(token.setSellAccumulationFee(2, 100)).to.be.revertedWith('Ledgity: accumulation + reflection fees exceed 100%');
        await expect(token.setSellAtSmallPriceAccumulationFee(2, 100)).to.be.revertedWith('Ledgity: accumulation + reflection fees exceed 100%');
      });
    });

    it('should NOT charge fee when buyer is excluded from dex fee', async () => {
      await token.setIsExcludedFromDexFee(alice, true);
      const aliceBalanceBefore = await token.balanceOf(alice);
      const usdcAmount = toTokens('10', await usdcToken.decimals());
      const boughtAmount = await buy(usdcAmount, aliceAccount);
      const reserves = await pair.getReserves();
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].sub(boughtAmount));
      expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex].add(usdcAmount));
      expect(await token.balanceOf(alice)).to.eq(aliceBalanceBefore.add(boughtAmount));
    });

    it('should NOT charge fee when seller is excluded from dex fee', async () => {
      await token.setIsExcludedFromDexFee(alice, true);
      const aliceBalanceBefore = await token.balanceOf(alice);
      const amount = toTokens('10');
      await sell(amount, aliceAccount);
      const reserves = await pair.getReserves();
      expect(await token.balanceOf(alice)).to.be.gte(aliceBalanceBefore.sub(amount));
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].add(amount));
      expect(reserves[usdcIndex]).to.be.lt(reservesBefore[usdcIndex]);
    });
  });

  describe('totalFees', () => {
    it('should record fees', async () => {
      await token.setIsExcludedFromDexFee(alice, false);
      const amount = toTokens(10);
      await sell(amount, aliceAccount);
      expect(await token.totalFees()).to.eq(amount.mul(4).div(100));
    });
  });

  describe('exclusion from dex fee', () => {
    it('should exclude the owner by default', async () => {
      expect(await token.isExcludedFromDexFee(alice)).to.eq(true);
    });

    it('should exclude the contract by default', async () => {
      expect(await token.isExcludedFromDexFee(token.address)).to.eq(true);
    });

    it('should exclude The Reserve by default', async () => {
      expect(await token.isExcludedFromDexFee(tokenReserve.address)).to.eq(true);
    });

    it('should NOT exclude any other account by default', async () => {
      expect(await token.isExcludedFromDexFee(bob)).to.eq(false);
    });

    it('should exclude an account from dex fee', async () => {
      await token.setIsExcludedFromDexFee(bob, true);
      expect(await token.isExcludedFromDexFee(bob)).to.eq(true);
    });

    it('should re-include an account in dex fee', async () => {
      await token.setIsExcludedFromDexFee(bob, true);
      await token.setIsExcludedFromDexFee(bob, false);
      expect(await token.isExcludedFromDexFee(bob)).to.eq(false);
    });

    it('should not allow not the owner to exclude or include an account from dex fee', async () => {
      await expect(token.connect(bobAccount).setIsExcludedFromDexFee(alice, true)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('exclusion from limits', () => {
    it('should exclude the owner by default', async () => {
      expect(await token.isExcludedFromLimits(alice)).to.eq(true);
    });

    it('should exclude the contract by default', async () => {
      expect(await token.isExcludedFromLimits(token.address)).to.eq(true);
    });

    it('should exclude The Reserve by default', async () => {
      expect(await token.isExcludedFromLimits(tokenReserve.address)).to.eq(true);
    });

    it('should NOT exclude any other account by default', async () => {
      expect(await token.isExcludedFromLimits(bob)).to.eq(false);
    });

    it('should exclude an account from limits', async () => {
      await token.setIsExcludedFromLimits(bob, true);
      expect(await token.isExcludedFromLimits(bob)).to.eq(true);
    });

    it('should re-include an account in limits', async () => {
      await token.setIsExcludedFromLimits(bob, true);
      await token.setIsExcludedFromLimits(bob, false);
      expect(await token.isExcludedFromLimits(bob)).to.eq(false);
    });

    it('should not allow not the owner to exclude or include an account from limits', async () => {
      await expect(token.connect(bobAccount).setIsExcludedFromLimits(alice, true)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('fee destination', () => {
    let pair: UniswapV2Pair;
    let tokenIndex: 0 | 1, usdcIndex: 0 | 1;
    let reservesBefore: { 0: BigNumber, 1: BigNumber; };
    beforeEach(async () => {
      await token.transfer(bob, NUM_TOKENS_TO_LIQUIFY_OR_COLLECT);
      pair = await getPair();
      [tokenIndex, usdcIndex] = await getPairIndices(pair);
      reservesBefore = await pair.getReserves();
    });

    it('should be set to "liquify" by default', async () => {
      expect(await token.feeDestination()).to.eq(0);
    });

    it('should be changeable by the owner', async () => {
      await token.setFeeDestination(1);
      expect(await token.feeDestination()).to.eq(1);
      await token.setFeeDestination(0);
      expect(await token.feeDestination()).to.eq(0);
      await expect(token.setFeeDestination(2)).to.be.reverted;
    });

    it('should NOT be changeable by not the owner', async () => {
      await expect(token.connect(bobAccount).setFeeDestination(1)).to.be.revertedWith('Ownable: caller is not the owner');
    });

    describe('min number of tokens to swap and liquify/collect', () => {
      it('should equal 0.15% of totalSupply', async () => {
        expect(await token.numTokensToSwap()).to.eq(INITIAL_TOTAL_SUPPLY.mul(15).div(10000));
      });

      it('should change', async () => {
        await token.setNumTokensToSwap(100);
        expect(await token.numTokensToSwap()).to.eq(100);
      });

      it('should not allow not the owner to change', async () => {
        await expect(token.connect(bobAccount).setNumTokensToSwap(100)).to.be.revertedWith('Ownable: caller is not the owner');
      });
    });

    it('should NOT do anything until the balance of the contract passes the predefined threshold', async () => {
      const tx = await token.transfer(token.address, NUM_TOKENS_TO_LIQUIFY_OR_COLLECT.sub(await token.balanceOf(token.address)).sub(1));
      await expect(tx).not.to.emit(tokenReserve, 'SwapAndLiquify');
      await expect(tx).not.to.emit(tokenReserve, 'SwapAndCollect');
      const reserves = await pair.getReserves();
      expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex]);
      expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex]);
    });

    it('should swap and liquify/collect exactly numTokensToSwap', async () => {
      const excess = toTokens('100');
      await token.transfer(token.address, excess);
      await token.transfer(token.address, NUM_TOKENS_TO_LIQUIFY_OR_COLLECT);
      expect(await token.balanceOf(token.address)).to.eq(excess);
    });

    describe('swapAndLiquify', () => {
      it('should swap and liquify if the fee destination is to liquify', async () => {
        await token.transfer(tokenReserve.address, toTokens('10'));
        await usdcToken.mint(tokenReserve.address, toTokens('10', await usdcToken.decimals()));
        const reserveTokenBalanceBefore = await token.balanceOf(tokenReserve.address);
        const reserveUsdcBalanceBefore = await usdcToken.balanceOf(tokenReserve.address);

        await token.transfer(tokenReserve.address, NUM_TOKENS_TO_LIQUIFY_OR_COLLECT);
        const tx = await token.transfer(token.address, NUM_TOKENS_TO_LIQUIFY_OR_COLLECT);
        await expect(tx)
          .to.emit(tokenReserve, 'SwapAndLiquify');
        // TODO
        // .withArgs()

        const reserves = await pair.getReserves();
        expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].add(NUM_TOKENS_TO_LIQUIFY_OR_COLLECT.mul(2)));
        // Swap and liquify does not change USDC reserves in the liquidity pool.
        expect(reserves[usdcIndex]).to.eq(reservesBefore[usdcIndex], 'USDC reserve');
        // should not leave any extra USDC or tokens on the balances
        expect(await token.balanceOf(token.address)).to.eq('0', 'token token');
        expect(await token.balanceOf(tokenReserve.address)).eq(reserveTokenBalanceBefore, 'token The Reserve');
        expect(await usdcToken.balanceOf(token.address)).to.eq('0', 'USDC token');
        expect(await usdcToken.balanceOf(tokenReserve.address)).eq(reserveUsdcBalanceBefore, 'USDC The Reserve');
      });
    });

    describe('swapAndCollect', () => {
      beforeEach(async () => {
        await token.setFeeDestination(1);  // collect
      });

      it('should swap and collect if the fee destination is to collect', async () => {
        const reserveTokenBalanceBefore = await token.balanceOf(tokenReserve.address);
        const reserveUsdcBalanceBefore = await usdcToken.balanceOf(tokenReserve.address);
        const tokenTokenBalanceBefore = await token.balanceOf(token.address);
        const tx = await token.transfer(token.address, NUM_TOKENS_TO_LIQUIFY_OR_COLLECT);
        await expect(tx)
          .to.emit(tokenReserve, 'SwapAndCollect');
        // TODO
        // .withArgs()
        const reserves = await pair.getReserves();
        expect(reserves[tokenIndex]).to.eq(reservesBefore[tokenIndex].add(tokenTokenBalanceBefore).add(NUM_TOKENS_TO_LIQUIFY_OR_COLLECT));
        expect(reserves[usdcIndex]).to.be.lt(reservesBefore[usdcIndex]);
        expect(await token.balanceOf(token.address)).to.eq(0);
        expect(await token.balanceOf(tokenReserve.address)).to.eq(reserveTokenBalanceBefore);
        expect(await usdcToken.balanceOf(tokenReserve.address)).to.be.gt(reserveUsdcBalanceBefore);
      });
    });
  });

  describe('transferFrom', () => {
    it('should emit Transfer event', async () => {
      await token.approve(bob, 10);
      await expect(token.connect(bobAccount).transferFrom(alice, charlie, 10))
        .to.emit(token, 'Transfer')
        .withArgs(alice, charlie, 10);
    });

    it('should emit Approval event', async () => {
      await expect(await token.approve(bob, 10)).to.emit(token, 'Approval').withArgs(alice, bob, 10);
      await expect(await token.approve(bob, 20)).to.emit(token, 'Approval').withArgs(alice, bob, 20);
      await expect(await token.connect(bobAccount).transferFrom(alice, charlie, 5)).to.emit(token, 'Approval').withArgs(alice, bob, 15);
      await expect(await token.increaseAllowance(bob, 10)).to.emit(token, 'Approval').withArgs(alice, bob, 25);
      await expect(await token.decreaseAllowance(bob, 20)).to.emit(token, 'Approval').withArgs(alice, bob, 5);
    });


    it('should approve tokens', async () => {
      await token.approve(bob, 10);
      expect(await token.allowance(alice, bob)).to.eq('10');
    });

    it('should transfer approved tokens', async () => {
      const aliceBalanceBefore = await token.balanceOf(alice);
      const amount = toTokens('10');
      await token.approve(charlie, amount);
      await token.connect(charlieAccount).transferFrom(alice, bob, amount);
      expect(await token.balanceOf(alice)).to.eq(aliceBalanceBefore.sub(amount), 'Alice');
      expect(await token.balanceOf(bob)).to.eq(amount, 'Bob');
    });

    it('should not transfer tokens when not approved', async () => {
      await expect(token.connect(charlieAccount).transferFrom(alice, bob, 10)).to.be.revertedWith('ReflectToken: transfer amount exceeds allowance');
    });

    it('should not transfer more tokens than approved', async () => {
      await token.approve(charlie, 10);
      await expect(token.connect(charlieAccount).transferFrom(alice, bob, 100)).to.be.revertedWith('ReflectToken: transfer amount exceeds allowance');
    });

    it('should reset allowance when transferred', async () => {
      await token.approve(charlie, 10);
      await token.connect(charlieAccount).transferFrom(alice, bob, 10);
      expect(await token.allowance(alice, charlie)).to.eq('0');
    });

    it('should decrease allowance when transferred less than allowance', async () => {
      await token.approve(charlie, 10);
      await token.connect(charlieAccount).transferFrom(alice, bob, 7);
      expect(await token.allowance(alice, charlie)).to.eq('3');
    });

    it('should increase allowance', async () => {
      await token.approve(charlie, 10);
      await token.increaseAllowance(charlie, 5);
      expect(await token.allowance(alice, charlie)).to.eq('15');
    });

    it('should decrease allowance', async () => {
      await token.approve(charlie, 10);
      await token.decreaseAllowance(charlie, 5);
      expect(await token.allowance(alice, charlie)).to.eq('5');
    });
  });

  describe('account exclusion', () => {
    it('should exclude token, reserve, and uniswap pair from RFI by default', async () => {
      expect(await token.isExcluded(token.address)).to.eq(true);
      expect(await token.isExcluded(tokenReserve.address)).to.eq(true);
      expect(await token.isExcluded((await getPair()).address)).to.eq(true);
    });

    it('should not exclude user accounts by default', async () => {
      expect(await token.isExcluded(alice)).to.eq(false);
      expect(await token.isExcluded(bob)).to.eq(false);
    });

    it('should exclude an account', async () => {
      await token.excludeAccount(bob);
      expect(await token.isExcluded(alice)).to.eq(false);
      expect(await token.isExcluded(bob)).to.eq(true);
    });

    it('should include an account', async () => {
      await token.excludeAccount(bob);
      expect(await token.isExcluded(bob)).to.eq(true);
      await token.includeAccount(bob);
      expect(await token.isExcluded(bob)).to.eq(false);
    });

    it('should only allow the owner to exclude and include an account', async () => {
      await token.excludeAccount(bob);
      await token.includeAccount(bob);
      await expect(token.connect(bobAccount).excludeAccount(charlie)).to.be.revertedWith('Ownable: caller is not the owner');
      await expect(token.connect(bobAccount).includeAccount(charlie)).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('setDex', () => {
    it('should change isDex', async () => {
      expect(await token.isDex(bob)).to.eq(false);  // sanity check
      await token.setDex(bob, true);
      expect(await token.isDex(bob)).to.eq(true);
    });

    it('should also exclude an account from RFI', async () => {
      await token.setDex(bob, true);
      expect(await token.isExcluded(bob)).to.eq(true);
    });

    it('should re-include an account in RFI', async () => {
      await token.setDex(bob, true);
      expect(await token.isExcluded(bob)).to.eq(true);  // sanity check
      await token.setDex(bob, false);
      expect(await token.isExcluded(bob)).to.eq(false);
    });

    it('should NOT revert when called twice', async () => {
      await token.setDex(bob, true);
      await token.setDex(bob, true);

      await token.setDex(bob, false);
      await token.setDex(bob, false);
    });

    it('should NOT allow not the owner to call it', async () => {
      await expect(token.connect(bobAccount).setDex(alice, true))
        .to.be.revertedWith('Ownable: caller is not the owner');
    });

    it('should NOT set any account as a DEX by default', async () => {
      expect(await token.isDex(token.address)).to.eq(false);
      expect(await token.isDex(alice)).to.eq(false);
      expect(await token.isDex(bob)).to.eq(false);
    });
  });

  describe('burn', () => {
    it('should burn tokens', async () => {
      const aliceBalanceBefore = await token.balanceOf(alice);
      const totalSupplyBefore = await token.totalSupply();
      const amount = toTokens('10');
      await token.burn(amount);
      expect(await token.balanceOf(alice)).to.eq(aliceBalanceBefore.sub(amount));
      expect(await token.totalSupply()).to.eq(totalSupplyBefore.sub(amount));
    });

    it('should burn from an excluded account', async () => {
      const aliceBalanceBefore = await token.balanceOf(alice);
      const totalSupplyBefore = await token.totalSupply();
      const amount = toTokens('10');
      await token.excludeAccount(alice);
      await token.burn(amount);
      expect(await token.balanceOf(alice)).to.eq(aliceBalanceBefore.sub(amount));
      expect(await token.totalSupply()).to.eq(totalSupplyBefore.sub(amount));
    });

    it('should allow anyone to burn tokens', async () => {
      await token.transfer(bob, toTokens('1000'));
      const bobBalanceBefore = await token.balanceOf(bob);
      const totalSupplyBefore = await token.totalSupply();
      const amount = toTokens('10');
      await token.connect(bobAccount).burn(amount);
      expect(await token.balanceOf(bob)).to.eq(bobBalanceBefore.sub(amount));
      expect(await token.totalSupply()).to.eq(totalSupplyBefore.sub(amount));
    });

    it('should NOT burn if the balance is insufficient', async () => {
      await token.transfer(bob, 10);
      await expect(token.connect(bobAccount).burn(11)).to.be.revertedWith('ReflectToken: burn amount is more than the balance');
    });

    it('should NOT burn from an excluded account if the balance is insufficient', async () => {
      await token.excludeAccount(bob);
      await token.transfer(bob, 10);
      await expect(token.connect(bobAccount).burn(11)).to.be.revertedWith('ReflectToken: burn amount is more than the balance');
    });
  });
});
