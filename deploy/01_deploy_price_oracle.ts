import { DeployFunction } from 'hardhat-deploy/types';

const deploy: DeployFunction = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const pairAddress = await deployments.read('Reserve', 'uniswapV2Pair');
  const priceOracleDeployResult = await deploy('LedgityPriceOracle', {
    from: deployer,
    args: [pairAddress],
    log: true,
  });

  await deployments.execute(
    'Ledgity',
    { from: deployer, log: true },
    'initializePriceOracle',
    priceOracleDeployResult.address,
  );
};

deploy.tags = ['price-oracle'];

export default deploy;
