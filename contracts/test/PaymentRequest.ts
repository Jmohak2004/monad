import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const DAY = 24 * 60 * 60;
const AMOUNT = 200_000_000n; // 200 AUSD (6 decimals)

describe("PaymentRequest", () => {
  async function deploy() {
    const [payee, payer, attacker] = await ethers.getSigners();
    const token = await ethers.deployContract("MockAUSD");
    const requests = await ethers.deployContract("PaymentRequest", [await token.getAddress()]);
    await token.faucet(payer.address, 1_000_000_000n);
    await token.connect(payer).approve(await requests.getAddress(), ethers.MaxUint256);
    await token.faucet(attacker.address, 1_000_000_000n);
    await token.connect(attacker).approve(await requests.getAddress(), ethers.MaxUint256);

    const id = ethers.hexlify(ethers.randomBytes(32));
    const expiry = (await time.latest()) + 7 * DAY;
    const digest = await requests.requestDigest(payee.address, AMOUNT, id, expiry);
    const sig = await payee.signMessage(ethers.getBytes(digest));
    return { token, requests, payee, payer, attacker, id, expiry, sig };
  }

  it("pays the payee once and emits RequestPaid", async () => {
    const { token, requests, payee, payer, id, expiry, sig } = await loadFixture(deploy);
    await expect(requests.connect(payer).pay(payee.address, AMOUNT, id, expiry, sig))
      .to.emit(requests, "RequestPaid")
      .withArgs(id, payee.address, payer.address, AMOUNT);
    expect(await token.balanceOf(payee.address)).to.equal(AMOUNT);
    expect(await requests.status(payee.address, id)).to.equal(1n); // Paid
  });

  it("rejects a second payment of the same QR", async () => {
    const { requests, payee, payer, attacker, id, expiry, sig } = await loadFixture(deploy);
    await requests.connect(payer).pay(payee.address, AMOUNT, id, expiry, sig);
    await expect(
      requests.connect(attacker).pay(payee.address, AMOUNT, id, expiry, sig),
    ).to.be.revertedWithCustomError(requests, "NotOpen");
  });

  it("rejects a changed amount, payee, or a replay on another deployment", async () => {
    const { token, requests, payee, payer, attacker, id, expiry, sig } = await loadFixture(deploy);
    await expect(requests.connect(payer).pay(payee.address, AMOUNT / 2n, id, expiry, sig)).to.be.revertedWithCustomError(
      requests,
      "BadSignature",
    );
    await expect(requests.connect(payer).pay(attacker.address, AMOUNT, id, expiry, sig)).to.be.revertedWithCustomError(
      requests,
      "BadSignature",
    );
    const other = await ethers.deployContract("PaymentRequest", [await token.getAddress()]);
    await token.connect(payer).approve(await other.getAddress(), AMOUNT);
    await expect(other.connect(payer).pay(payee.address, AMOUNT, id, expiry, sig)).to.be.revertedWithCustomError(
      other,
      "BadSignature",
    );
  });

  it("rejects payment after expiry", async () => {
    const { requests, payee, payer, id, expiry, sig } = await loadFixture(deploy);
    await time.increaseTo(expiry + 1);
    await expect(requests.connect(payer).pay(payee.address, AMOUNT, id, expiry, sig)).to.be.revertedWithCustomError(
      requests,
      "Expired",
    );
  });

  it("cancel kills the QR; nobody else can cancel it", async () => {
    const { requests, payee, payer, attacker, id, expiry, sig } = await loadFixture(deploy);
    await requests.connect(attacker).cancel(id); // only cancels the attacker's own id
    expect(await requests.status(payee.address, id)).to.equal(0n);

    await expect(requests.connect(payee).cancel(id)).to.emit(requests, "RequestCancelled").withArgs(id, payee.address);
    await expect(requests.connect(payer).pay(payee.address, AMOUNT, id, expiry, sig)).to.be.revertedWithCustomError(
      requests,
      "NotOpen",
    );
    await expect(requests.connect(payee).cancel(id)).to.be.revertedWithCustomError(requests, "NotOpen");
  });
});
