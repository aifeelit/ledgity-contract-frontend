import { DeployFunction } from 'hardhat-deploy/types';

const deploy: DeployFunction = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer, uniswapRouter, usdc } = await getNamedAccounts();
  const ledgityDeployResult = await deploy('Ledgity', {
    from: deployer,
    args: [],
    log: true,
  });

  const timelockDeployResult = await deploy('Timelock', {
    from: deployer,
    args: [157788000], // 5 years
    log: true,
  });

  const reserveDeployResult = await deploy('Reserve', {
    from: deployer,
    args: [
      uniswapRouter,
      ledgityDeployResult.address,
      usdc,
      timelockDeployResult.address,
    ],
    log: true,
  });

  await deployments.execute(
    'Ledgity',
    { from: deployer, log: true },
    'initializeReserve',
    reserveDeployResult.address,
  );
};

deploy.tags = ['ledgity'];

export default deploy;
