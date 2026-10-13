import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

const DAY = 24 * 60 * 60;
const AMOUNT = 200_000_000n; // 200 AUSD (6 decimals)

describe("ClaimEscrow", () => {
  async function deploy() {
    const [sender, recipient, relayer, attacker] = await ethers.getSigners();
    const token = await ethers.deployContract("MockAUSD");
    const escrow = await ethers.deployContract("ClaimEscrow", [await token.getAddress()]);
    await token.faucet(sender.address, 1_000_000_000n);
    await token.connect(sender).approve(await escrow.getAddress(), ethers.MaxUint256);
    return { token, escrow, sender, recipient, relayer, attacker };
  }

  async function deployWithTransfer() {
    const ctx = await deploy();
    const claimKey = ethers.Wallet.createRandom();
    const expiry = (await time.latest()) + 7 * DAY;
    await ctx.escrow.connect(ctx.sender).create(AMOUNT, claimKey.address, expiry);
    return { ...ctx, claimKey, expiry };
  }

  async function sign(escrow: any, claimKey: ethers.HDNodeWallet, recipient: string) {
    const digest = await escrow.claimDigest(claimKey.address, recipient);
    return claimKey.signMessage(ethers.getBytes(digest));
  }

  describe("create", () => {
    it("locks tokens and emits Created", async () => {
      const { token, escrow, sender } = await loadFixture(deploy);
      const claimKey = ethers.Wallet.createRandom();
      const expiry = (await time.latest()) + 7 * DAY;

      await expect(escrow.connect(sender).create(AMOUNT, claimKey.address, expiry))
        .to.emit(escrow, "Created")
        .withArgs(claimKey.address, sender.address, AMOUNT, expiry);

      expect(await token.balanceOf(await escrow.getAddress())).to.equal(AMOUNT);
      const t = await escrow.transfers(claimKey.address);
      expect(t.sender).to.equal(sender.address);
      expect(t.amount).to.equal(AMOUNT);
      expect(t.status).to.equal(1n); // Pending
    });

    it("rejects zero amount, zero key, and bad expiry", async () => {
      const { escrow } = await loadFixture(deploy);
      const key = ethers.Wallet.createRandom().address;
      const now = await time.latest();
      await expect(escrow.create(0, key, now + DAY)).to.be.revertedWithCustomError(escrow, "ZeroAmount");
      await expect(escrow.create(AMOUNT, ethers.ZeroAddress, now + DAY)).to.be.revertedWithCustomError(
        escrow,
        "ZeroAddress",
      );
      await expect(escrow.create(AMOUNT, key, now)).to.be.revertedWithCustomError(escrow, "BadExpiry");
      await expect(escrow.create(AMOUNT, key, now + 91 * DAY)).to.be.revertedWithCustomError(escrow, "BadExpiry");
    });

    it("rejects a reused claim key", async () => {
      const { escrow, claimKey, expiry } = await loadFixture(deployWithTransfer);
      await expect(escrow.create(AMOUNT, claimKey.address, expiry)).to.be.revertedWithCustomError(
        escrow,
        "ClaimKeyInUse",
      );
    });
  });

  describe("claim", () => {
    it("pays the recipient when submitted by a relayer", async () => {
      const { token, escrow, sender, recipient, relayer, claimKey } = await loadFixture(deployWithTransfer);
      const sig = await sign(escrow, claimKey, recipient.address);

      await expect(escrow.connect(relayer).claim(claimKey.address, recipient.address, sig))
        .to.emit(escrow, "Claimed")
        .withArgs(claimKey.address, recipient.address, sender.address, AMOUNT);

      expect(await token.balanceOf(recipient.address)).to.equal(AMOUNT);
      expect((await escrow.transfers(claimKey.address)).status).to.equal(2n); // Claimed
    });

    it("cannot be redirected to another address (front-running)", async () => {
      const { escrow, recipient, attacker, claimKey } = await loadFixture(deployWithTransfer);
      const sig = await sign(escrow, claimKey, recipient.address);
      await expect(
        escrow.connect(attacker).claim(claimKey.address, attacker.address, sig),
      ).to.be.revertedWithCustomError(escrow, "BadSignature");
    });

    it("rejects a signature from the wrong key", async () => {
      const { escrow, recipient, claimKey } = await loadFixture(deployWithTransfer);
      const other = ethers.Wallet.createRandom();
      const digest = await escrow.claimDigest(claimKey.address, recipient.address);
      const sig = await other.signMessage(ethers.getBytes(digest));
      await expect(escrow.claim(claimKey.address, recipient.address, sig)).to.be.revertedWithCustomError(
        escrow,
        "BadSignature",
      );
    });

    it("cannot be claimed twice", async () => {
      const { escrow, recipient, claimKey } = await loadFixture(deployWithTransfer);
      const sig = await sign(escrow, claimKey, recipient.address);
      await escrow.claim(claimKey.address, recipient.address, sig);
      await expect(escrow.claim(claimKey.address, recipient.address, sig)).to.be.revertedWithCustomError(
        escrow,
        "NotPending",
      );
    });

    it("cannot be claimed after expiry", async () => {
      const { escrow, recipient, claimKey, expiry } = await loadFixture(deployWithTransfer);
      const sig = await sign(escrow, claimKey, recipient.address);
      await time.increaseTo(expiry + 1);
      await expect(escrow.claim(claimKey.address, recipient.address, sig)).to.be.revertedWithCustomError(
        escrow,
        "Expired",
      );
    });

    it("signatures do not replay across escrow deployments", async () => {
      const { token, escrow, sender, recipient, claimKey, expiry } = await loadFixture(deployWithTransfer);
      const sig = await sign(escrow, claimKey, recipient.address);
      const escrow2 = await ethers.deployContract("ClaimEscrow", [await token.getAddress()]);
      await token.connect(sender).approve(await escrow2.getAddress(), AMOUNT);
      await escrow2.connect(sender).create(AMOUNT, claimKey.address, expiry);
      await expect(escrow2.claim(claimKey.address, recipient.address, sig)).to.be.revertedWithCustomError(
        escrow2,
        "BadSignature",
      );
    });
  });

  describe("refund", () => {
    it("returns funds to the sender after expiry", async () => {
      const { token, escrow, sender, claimKey, expiry } = await loadFixture(deployWithTransfer);
      const before = await token.balanceOf(sender.address);
      await time.increaseTo(expiry + 1);
      await expect(escrow.connect(sender).refund(claimKey.address))
        .to.emit(escrow, "Refunded")
        .withArgs(claimKey.address, sender.address, AMOUNT);
      expect(await token.balanceOf(sender.address)).to.equal(before + AMOUNT);
    });

    it("is blocked before expiry, for non-senders, and after a claim", async () => {
      const { escrow, sender, recipient, attacker, claimKey, expiry } = await loadFixture(deployWithTransfer);
      await expect(escrow.connect(sender).refund(claimKey.address)).to.be.revertedWithCustomError(
        escrow,
        "NotExpired",
      );
      await time.increaseTo(expiry + 1);
      await expect(escrow.connect(attacker).refund(claimKey.address)).to.be.revertedWithCustomError(
        escrow,
        "NotSender",
      );

      const fresh = await loadFixture(deployWithTransfer);
      const sig = await sign(fresh.escrow, fresh.claimKey, recipient.address);
      await fresh.escrow.claim(fresh.claimKey.address, recipient.address, sig);
      await time.increaseTo(fresh.expiry + 1);
      await expect(fresh.escrow.connect(fresh.sender).refund(fresh.claimKey.address)).to.be.revertedWithCustomError(
        fresh.escrow,
        "NotPending",
      );
    });
  });
});
