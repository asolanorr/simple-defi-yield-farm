const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('DAppToken', function () {
  let DAppToken;
  let dappToken;
  let owner, addr1, addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    
    DAppToken = await ethers.getContractFactory('DAppToken');
    dappToken = await DAppToken.deploy(owner.address);
    await dappToken.waitForDeployment();
  });

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await dappToken.owner()).to.equal(owner.address);
    });

    it('Should have correct name and symbol', async function () {
      expect(await dappToken.name()).to.equal('DApp Token');
      expect(await dappToken.symbol()).to.equal('DAPP');
    });

    it('Should start with zero total supply', async function () {
      expect(await dappToken.totalSupply()).to.equal(0);
    });
  });

  describe('Minting', function () {
    it('Should allow owner to mint tokens', async function () {
      const mintAmount = ethers.parseEther('100');
      
      await dappToken.mint(addr1.address, mintAmount);
      
      expect(await dappToken.balanceOf(addr1.address)).to.equal(mintAmount);
      expect(await dappToken.totalSupply()).to.equal(mintAmount);
    });

    it('Should fail if non-owner tries to mint', async function () {
      const mintAmount = ethers.parseEther('100');
      
      await expect(
        dappToken.connect(addr1).mint(addr2.address, mintAmount)
      ).to.be.revertedWithCustomError(dappToken, 'OwnableUnauthorizedAccount');
    });

    it('Should emit Transfer event when minting', async function () {
      const mintAmount = ethers.parseEther('100');
      
      await expect(dappToken.mint(addr1.address, mintAmount))
        .to.emit(dappToken, 'Transfer')
        .withArgs(ethers.ZeroAddress, addr1.address, mintAmount);
    });
  });

  describe('Ownership', function () {
    it('Should allow owner to transfer ownership', async function () {
      await dappToken.transferOwnership(addr1.address);
      expect(await dappToken.owner()).to.equal(addr1.address);
    });

    it('Should fail if non-owner tries to transfer ownership', async function () {
      await expect(
        dappToken.connect(addr1).transferOwnership(addr2.address)
      ).to.be.revertedWithCustomError(dappToken, 'OwnableUnauthorizedAccount');
    });
  });
});
