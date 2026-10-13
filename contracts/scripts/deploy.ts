import { ethers, network } from "hardhat";
import { mkdirSync, writeFileSync } from "fs";
import path from "path";

// Deploys ClaimEscrow. Uses AUSD_ADDRESS if set (e.g. real AUSD on mainnet);
// otherwise deploys MockAUSD with an open faucet for testnet demos.
async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Deploying to ${network.name} (${chainId}) from ${deployer.address}`);

  let token = process.env.AUSD_ADDRESS;
  if (!token) {
    const mock = await ethers.deployContract("MockAUSD");
    await mock.waitForDeployment();
    token = await mock.getAddress();
    console.log(`MockAUSD:    ${token}`);
  } else {
    console.log(`AUSD:        ${token} (existing)`);
  }

  const escrow = await ethers.deployContract("ClaimEscrow", [token]);
  const receipt = await escrow.deploymentTransaction()!.wait();
  const escrowAddress = await escrow.getAddress();
  console.log(`ClaimEscrow: ${escrowAddress} (block ${receipt!.blockNumber})`);

  const out = {
    chainId: Number(chainId),
    token,
    tokenIsMock: !process.env.AUSD_ADDRESS,
    escrow: escrowAddress,
    escrowDeployBlock: receipt!.blockNumber,
  };
  const dir = path.join(__dirname, "..", "deployments");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${chainId}.json`), JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote deployments/${chainId}.json`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
