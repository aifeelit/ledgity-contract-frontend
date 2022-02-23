import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'hardhat-deploy';
import { HardhatUserConfig, task } from 'hardhat/config';
import 'solidity-coverage';
import { PRIVATE_NETWORK_PRIVATE_KEY } from './env';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.6.12',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    artifacts: './client/src/contracts',
  },
  networks: {
    private: {
      url: 'http://52.12.224.224:8545',
      chainId: 1337,
      accounts: [PRIVATE_NETWORK_PRIVATE_KEY],
    },
  },
  namedAccounts: {
    deployer: {
      private: 0,
    },
    uniswapRouter: {
      private: '0xA526452c864437eaAB0858459720bE82d357fA80',
    },
    usdc: {
      private: '0xEc6802f549BC3E99FF12aF779A8e0B90453864C1',
    },
  },
  typechain: {
    externalArtifacts: [
      './uniswap_build/**/*.json',
    ],
  },
};

export default config;

task('deploy-test-environment', 'Setup test environment for testing purposes', async (args, { ethers }) => {
  const { deployUniswap } = await import('./shared/utils');
  const [signer] = await ethers.getSigners();
  const { factory, router, weth } = await deployUniswap(signer);
  console.log('Factory:', factory.address);
  console.log('Router:', router.address);
  console.log('WETH:', weth.address);
  const mockUsdc = await (await ethers.getContractFactory('MockUSDC')).deploy();
  console.log('Mock USDC:', mockUsdc.address);
});
