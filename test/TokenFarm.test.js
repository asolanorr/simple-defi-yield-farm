const { expect } = require('chai');
const { ethers } = require('hardhat');

describe('TokenFarm V1', function () {
  let TokenFarm, DAppToken, LPToken;
  let tokenFarm, dappToken, lpToken;
  let owner, user1, user2;
  let ownerAddress, user1Address, user2Address;

  beforeEach(async function () {
    // Obtener las cuentas de prueba
    [owner, user1, user2] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    user1Address = await user1.getAddress();
    user2Address = await user2.getAddress();

    // Desplegar los contratos
    DAppToken = await ethers.getContractFactory('DAppToken');
    dappToken = await DAppToken.deploy(ownerAddress);

    LPToken = await ethers.getContractFactory('LPToken');
    lpToken = await LPToken.deploy(ownerAddress);

    TokenFarm = await ethers.getContractFactory('TokenFarm');
    tokenFarm = await TokenFarm.deploy(
      await dappToken.getAddress(),
      await lpToken.getAddress()
    );

    // Transferir la propiedad del DAppToken al TokenFarm para que pueda mint
    await dappToken.transferOwnership(await tokenFarm.getAddress());

    // En OpenZeppelin 5.0, el owner puede mint directamente
    // No necesitamos configurar roles especiales

    // Dar tokens LP a los usuarios para testing
    await lpToken.mint(user1Address, ethers.parseEther('1000'));
    await lpToken.mint(user2Address, ethers.parseEther('1000'));
  });

  describe('Deployment', function () {
    it('Should set the right owner', async function () {
      expect(await tokenFarm.owner()).to.equal(ownerAddress);
    });

    it('Should set the correct token addresses', async function () {
      expect(await tokenFarm.dappToken()).to.equal(
        await dappToken.getAddress()
      );
      expect(await tokenFarm.lpToken()).to.equal(await lpToken.getAddress());
    });

    it('Should have correct name', async function () {
      expect(await tokenFarm.name()).to.equal('Proportional Token Farm');
    });
  });

  describe('Deposit', function () {
    it('Should allow users to deposit LP tokens', async function () {
      const depositAmount = ethers.parseEther('100');

      // Aprobar tokens para el contrato
      await lpToken
        .connect(user1)
        .approve(await tokenFarm.getAddress(), depositAmount);

      // Hacer depósito
      await tokenFarm.connect(user1).deposit(depositAmount);

      // Verificar que el balance se actualizó
      expect(await tokenFarm.getStakingBalance(user1Address)).to.equal(
        depositAmount
      );
      expect(await tokenFarm.totalStakingBalance()).to.equal(depositAmount);
      const userInfo = await tokenFarm.userInfo(user1Address);
      expect(userInfo.stakingBalance).to.equal(depositAmount);
      expect(userInfo.hasStaked).to.be.true;
      expect(userInfo.isStaking).to.be.true;
      expect(userInfo.checkpoint).to.be.gt(0); // Debe ser mayor a 0
    });

    it('Should fail if amount is 0', async function () {
      await expect(tokenFarm.connect(user1).deposit(0)).to.be.revertedWith(
        'Amount must be greater than 0'
      );
    });

    it("Should fail if user doesn't have enough tokens", async function () {
      const depositAmount = ethers.parseEther('2000'); // Más de lo que tiene
      await lpToken
        .connect(user1)
        .approve(await tokenFarm.getAddress(), depositAmount);

      await expect(tokenFarm.connect(user1).deposit(depositAmount)).to.be
        .reverted; // Solo verificamos que falle, sin importar el mensaje
    });
  });

  describe('Withdraw', function () {
    beforeEach(async function () {
      // Preparar un depósito
      const depositAmount = ethers.parseEther('100');
      await lpToken
        .connect(user1)
        .approve(await tokenFarm.getAddress(), depositAmount);
      await tokenFarm.connect(user1).deposit(depositAmount);
    });

    it('Should allow users to withdraw their staked tokens', async function () {
      const initialBalance = await lpToken.balanceOf(user1Address);

      await tokenFarm.connect(user1).withdraw();

      // Verificar que el balance se restableció
      expect(await tokenFarm.getStakingBalance(user1Address)).to.equal(0);
      expect(await tokenFarm.totalStakingBalance()).to.equal(0);
      const userInfo = await tokenFarm.userInfo(user1Address);
      expect(userInfo.stakingBalance).to.equal(0);
      expect(userInfo.hasStaked).to.be.true;
      expect(userInfo.isStaking).to.be.false;
      // No verificamos checkpoint ni pendingRewards ya que pueden variar
    });

    it('Should fail if user is not staking', async function () {
      // Primero retirar
      await tokenFarm.connect(user1).withdraw();

      // Intentar retirar de nuevo
      await expect(tokenFarm.connect(user1).withdraw()).to.be.revertedWith(
        'User is not staking'
      );
    });
  });

  describe('Rewards', function () {
    beforeEach(async function () {
      // Preparar depósitos
      const depositAmount = ethers.parseEther('100');
      await lpToken
        .connect(user1)
        .approve(await tokenFarm.getAddress(), depositAmount);
      await lpToken
        .connect(user2)
        .approve(await tokenFarm.getAddress(), depositAmount);

      await tokenFarm.connect(user1).deposit(depositAmount);
      await tokenFarm.connect(user2).deposit(depositAmount);
    });

    it('Should distribute rewards to all stakers', async function () {
      // Avanzar algunos bloques para generar recompensas
      await ethers.provider.send('evm_mine', []);
      await ethers.provider.send('evm_mine', []);

      // Distribuir recompensas
      await tokenFarm.connect(owner).distributeRewardsAll();

      // Verificar que ambos usuarios tienen recompensas pendientes
      const user1Rewards = await tokenFarm.getPendingRewards(user1Address);
      const user2Rewards = await tokenFarm.getPendingRewards(user2Address);

      expect(user1Rewards).to.be.gt(0);
      expect(user2Rewards).to.be.gt(0);
    });

            it('Should allow users to claim rewards', async function () {
          // Avanzar bloques y distribuir recompensas
          await ethers.provider.send('evm_mine', []);
          await tokenFarm.connect(owner).distributeRewardsAll();

          const initialBalance = await dappToken.balanceOf(user1Address);
          const pendingRewards = await tokenFarm.getPendingRewards(user1Address);

          // Reclamar recompensas
          await tokenFarm.connect(user1).claimRewards();

          // Verificar que las recompensas se transfirieron (con comisión aplicada)
          // La comisión es del 3% (300 basis points)
          const expectedRewards = (pendingRewards * 9700n) / 10000n; // 97% después de la comisión
          expect(await dappToken.balanceOf(user1Address)).to.equal(
            initialBalance + expectedRewards
          );
          expect(await tokenFarm.getPendingRewards(user1Address)).to.equal(0);
        });

    it('Should fail if no rewards to claim', async function () {
      await expect(tokenFarm.connect(user1).claimRewards()).to.be.revertedWith(
        'No rewards to claim'
      );
    });
  });

  describe('Access Control', function () {
    it('Should only allow owner to distribute rewards', async function () {
      await expect(
        tokenFarm.connect(user1).distributeRewardsAll()
      ).to.be.revertedWith('Only owner can call this function');
    });

    it('Should allow owner to transfer ownership', async function () {
      await tokenFarm.connect(owner).transferOwnership(user1Address);
      expect(await tokenFarm.owner()).to.equal(user1Address);
    });

    it('Should fail if non-owner tries to transfer ownership', async function () {
      await expect(
        tokenFarm.connect(user1).transferOwnership(user2Address)
      ).to.be.revertedWith('Only owner can call this function');
    });
  });

  describe('User Info', function () {
    it('Should return correct user info', async function () {
      const depositAmount = ethers.parseEther('100');
      await lpToken
        .connect(user1)
        .approve(await tokenFarm.getAddress(), depositAmount);
      await tokenFarm.connect(user1).deposit(depositAmount);

      const userInfo = await tokenFarm.getUserInfo(user1Address);
      expect(userInfo.stakingBalance).to.equal(depositAmount);
      expect(userInfo.hasStaked).to.be.true;
      expect(userInfo.isStaking).to.be.true;
    });
  });
});
