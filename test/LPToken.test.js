const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('LPToken', function () {
  let LPToken;
  let lpToken;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    LPToken = await ethers.getContractFactory('LPToken');
    lpToken = await LPToken.deploy(owner.address);
    await lpToken.waitForDeployment();
  });

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await lpToken.owner()).to.equal(owner.address);
    });

    it('Should have correct name and symbol', async function () {
      expect(await lpToken.name()).to.equal('LP Token');
      expect(await lpToken.symbol()).to.equal('LPT');
    });

    it('Should start with zero total supply', async function () {
      expect(await lpToken.totalSupply()).to.equal(0);
    });
  });

  describe('Minting', function () {
    it('Should allow owner to mint tokens', async function () {
      const mintAmount = ethers.parseEther('1000');
      
      await lpToken.mint(addr1.address, mintAmount);
      
      expect(await lpToken.balanceOf(addr1.address)).to.equal(mintAmount);
      expect(await lpToken.totalSupply()).to.equal(mintAmount);
    });

    it('Should fail if non-owner tries to mint', async function () {
      const mintAmount = ethers.parseEther('1000');
      
      await expect(
        lpToken.connect(addr1).mint(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(lpToken, 'OwnableUnauthorizedAccount');
    });

    it('Should emit Transfer event when minting', async function () {
      const mintAmount = ethers.parseEther('1000');
      
      await expect(lpToken.mint(addr1.address, mintAmount))
        .to.emit(lpToken, 'Transfer')
        .withArgs(ethers.ZeroAddress, addr1.address, mintAmount);
    });
  });

  describe('ERC20 Functionality', function () {
    beforeEach(async function () {
      // Mint some tokens for testing
      await lpToken.mint(addr1.address, ethers.parseEther('1000'));
      await lpToken.mint(addr2.address, ethers.parseEther('500'));
    });

    it('Should allow token transfers', async function () {
      const transferAmount = ethers.parseEther('100');
      
      await lpToken.connect(addr1).transfer(addr2.address, transferAmount);
      
      expect(await lpToken.balanceOf(addr1.address)).to.equal(ethers.parseEther('900'));
      expect(await lpToken.balanceOf(addr2.address)).to.equal(ethers.parseEther('600'));
    });

    it('Should allow approvals and transferFrom', async function () {
      const approveAmount = ethers.parseEther('200');
      const transferAmount = ethers.parseEther('100');
      
      // Approve addr2 to spend addr1's tokens
      await lpToken.connect(addr1).approve(addr2.address, approveAmount);
      
      // Check allowance
      expect(await lpToken.allowance(addr1.address, addr2.address)).to.equal(approveAmount);
      
      // Transfer from addr1 to addr2 using addr2's approval
      await lpToken.connect(addr2).transferFrom(addr1.address, addr2.address, transferAmount);
      
      expect(await lpToken.balanceOf(addr1.address)).to.equal(ethers.parseEther('900'));
      expect(await lpToken.balanceOf(addr2.address)).to.equal(ethers.parseEther('600'));
      expect(await lpToken.allowance(addr1.address, addr2.address)).to.equal(ethers.parseEther('100'));
    });

    it('Should fail transfer if insufficient balance', async function () {
      const transferAmount = ethers.parseEther('2000'); // More than addr1 has
      
      await expect(
        lpToken.connect(addr1).transfer(addr2.address, transferAmount)
      ).to.be.revertedWithCustomError(lpToken, 'ERC20InsufficientBalance');
    });
  });

  describe('Ownership', function () {
    it('Should allow owner to transfer ownership', async function () {
      await lpToken.transferOwnership(addr1.address);
      expect(await lpToken.owner()).to.equal(addr1.address);
    });

    it('Should fail if non-owner tries to transfer ownership', async function () {
      await expect(
        lpToken.connect(addr1).transferOwnership(addr2.address)
      ).to.be.revertedWithCustomError(lpToken, 'OwnableUnauthorizedAccount');
    });
  });
});
