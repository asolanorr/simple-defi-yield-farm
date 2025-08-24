const { ethers } = require('hardhat');

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  // Deploy LPToken
  const LPToken = await ethers.getContractFactory('LPToken');
  const lpToken = await LPToken.deploy(deployer.address);
  await lpToken.waitForDeployment();
  console.log('LPToken deployed to:', await lpToken.getAddress());

  // Deploy DappToken
  const DappToken = await ethers.getContractFactory('DAppToken');
  const dappToken = await DappToken.deploy(deployer.address);
  await dappToken.waitForDeployment();
  console.log('DappToken deployed to:', await dappToken.getAddress());

  // Deploy TokenFarm
  const TokenFarm = await ethers.getContractFactory('TokenFarm');
  const tokenFarm = await TokenFarm.deploy(
    await lpToken.getAddress(),
    await dappToken.getAddress()
  );
  await tokenFarm.waitForDeployment();
  console.log('TokenFarm deployed to:', await tokenFarm.getAddress());

  // Mint tokens rewards
  const initialReward = ethers.parseEther('10000'); // 10,000 DAPP
  let tx = await dappToken.mint(await tokenFarm.getAddress(), initialReward);
  await tx.wait();
  console.log(`Minted ${initialReward.toString()} DAPP to TokenFarm`);

  // Deploy TokenFarmV2
  const TokenFarmV2 = await ethers.getContractFactory('TokenFarmV2');
  const tokenFarmV2 = await TokenFarmV2.deploy(
    await lpToken.getAddress(),
    await dappToken.getAddress()
  );
  await tokenFarmV2.waitForDeployment();
  console.log('TokenFarmV2 deployed to:', await tokenFarmV2.getAddress());

  tx = await dappToken.mint(await tokenFarmV2.getAddress(), initialReward);
  await tx.wait();
  console.log(`Minted ${initialReward.toString()} DAPP to TokenFarmV2`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
