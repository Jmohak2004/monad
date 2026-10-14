import { ethers, network } from "hardhat";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";

// Deploys ClaimEscrow. Uses AUSD_ADDRESS if set (e.g. real AUSD on mainnet);
// otherwise deploys MockAUSD with an open faucet for testnet demos.
// With ONLY=PaymentRequest, deploys just PaymentRequest against the existing
// deployments/<chainId>.json token, so live claim links keep working.
async function main() {
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  console.log(`Deploying to ${network.name} (${chainId}) from ${deployer.address}`);
  const dir = path.join(__dirname, "..", "deployments");
  const file = path.join(dir, `${chainId}.json`);

  if (process.env.ONLY === "PaymentRequest") {
    const existing = JSON.parse(readFileSync(file, "utf8"));
    const { address, block } = await deployRequests(existing.token);
    writeFileSync(file, JSON.stringify({ ...existing, requests: address, requestsDeployBlock: block }, null, 2) + "\n");
    console.log(`Updated deployments/${chainId}.json`);
    return;
  }

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
  const requests = await deployRequests(token);

  const out = {
    chainId: Number(chainId),
    token,
    tokenIsMock: !process.env.AUSD_ADDRESS,
    escrow: escrowAddress,
    escrowDeployBlock: receipt!.blockNumber,
    requests: requests.address,
    requestsDeployBlock: requests.block,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log(`Wrote deployments/${chainId}.json`);
}

async function deployRequests(token: string) {
  const c = await ethers.deployContract("PaymentRequest", [token]);
  const receipt = await c.deploymentTransaction()!.wait();
  const address = await c.getAddress();
  console.log(`PaymentRequest: ${address} (block ${receipt!.blockNumber})`);
  return { address, block: receipt!.blockNumber };
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
